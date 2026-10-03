/**
 * AddAuditStore — durable job-file persistence for the add execution engine (ADD-08).
 *
 * CONTRACT:
 * - Every group outcome is written to disk atomically (write-to-temp + rename) before
 *   moving to the next group. This guarantees crash-safety: a partial write leaves the
 *   previous valid checkpoint intact (the tmp file is orphaned, not the final file).
 * - On relaunch, readJob() returns the on-disk job (Zod-validated) or null. The caller
 *   checks status !== 'complete' to detect incomplete jobs and offer Resume/Discard.
 * - getRemaining() returns the ordered subset of dialogIds not yet covered by outcomes.
 * - sameDialogIdSet() is a pure, order-insensitive set-equality helper AddExecutor uses
 *   to decide whether a new execute() call continues an existing job (same dialog set)
 *   or starts a fresh one (D-20 continuation-based resume — see 14-PATTERNS.md Pattern 1
 *   divergence note: unlike RemovalExecutor/TagExecutor, AddExecutor does NOT mint a
 *   fresh jobId on every execute() call).
 *
 * SECURITY:
 * - Job file written with mode 0o600 (owner-read-only) — same as session.bin and
 *   tag-job.json.
 * - targetAccessHash is stored for resume (resolver may not be live on relaunch).
 *   Access-hash is not a session credential; 0o600 is an acceptable protection level.
 *
 * THREAT T-14-03: Zod-validates AddJobFile before returning from readJob();
 * returns null on any parse/validation error — prevents injected/corrupted content.
 * THREAT T-14-04: writeAtomic passes mode 0o600 to writeFileSync on every write.
 */

import { z } from 'zod'
import type { AddJobFile, AddGroupOutcome, AddDmStatus } from '@shared/addTypes'

// ── Dependency types ────────────────────────────────────────────────────────

/** Minimal fs surface needed — injectable for tests. */
export interface AddAuditStoreFsDeps {
  writeFileSync(path: string, data: string | Buffer, opts?: unknown): void
  renameSync(from: string, to: string): void
  readFileSync(path: string): Buffer
  existsSync(path: string): boolean
  unlinkSync(path: string): void
}

/** Minimal app surface needed — injectable for tests. */
export interface AddAuditStoreAppDeps {
  getPath(name: 'userData'): string
}

/** Injectable dependencies for testability (production defaults to real electron/fs). */
export interface AddAuditStoreDeps {
  fs?: AddAuditStoreFsDeps
  app?: AddAuditStoreAppDeps
  /** Override the job file name (default: 'add-job.json'). */
  jobFileName?: string
}

// ── AddAuditStore interface ─────────────────────────────────────────────────

export interface AddAuditStore {
  /**
   * Write the initial job file atomically.
   * Overwrites any existing job file (rotation: complete job overwritten; incomplete
   * job overwritten on Discard + new start).
   */
  initJob(job: AddJobFile): void

  /**
   * Append a per-group outcome to the in-memory job, then atomically re-write the
   * job file to disk. Called after every group completes.
   */
  checkpoint(dialogId: string, outcome: AddGroupOutcome): void

  /**
   * Update the job's status (and optional completedAt/dmStatus), then atomically re-write.
   * Used by the executor when transitioning to 'complete' | 'stopped' | 'hard-stopped'.
   * dmStatus is passed on the 'complete' transition (Plan 14-09) so the persisted job file
   * reflects the end-of-run DM outcome (D-13/D-14) alongside status/completedAt.
   */
  setStatus(status: AddJobFile['status'], completedAt?: string, dmStatus?: AddDmStatus): void

  /**
   * Read and Zod-validate the job file.
   * Returns null when:
   * - No file exists at the expected path
   * - File content is not valid JSON
   * - JSON does not match the AddJobFile schema (including a missing dmStatus — it is
   *   a required field, unlike optional fields on Tag/Removal job files)
   */
  readJob(): AddJobFile | null

  /**
   * Delete the job file. No-op if absent.
   * Called on Discard or after a new run starts (cleanup).
   */
  clearJob(): void

  /**
   * Return the ordered list of dialogIds not yet covered by outcomes.
   * Computed by set subtraction: dialogIds − {o.dialogId for each outcome}.
   * Preserves original checklist order.
   */
  getRemaining(): string[]
}

// ── Zod schema for job file validation (T-14-03) ──────────────────────────────

const AddGroupOutcomeSchema = z.object({
  dialogId: z.string(),
  status: z.enum(['done', 'already-member', 'privacy-blocked', 'failed', 'skipped']),
  errorCode: z.string().optional(),
  reason: z.enum(['privacy', 'channel-full']).optional(),
  link: z.string().optional(),
  premiumWouldAllow: z.boolean().optional(),
  timestamp: z.string(),
})

const AddJobFileSchema = z.object({
  schemaVersion: z.literal(1),
  jobId: z.string(),
  targetId: z.string(),
  targetName: z.string(),
  targetAccessHash: z.string(),
  dialogIds: z.array(z.string()),
  outcomes: z.array(AddGroupOutcomeSchema),
  dmStatus: z.enum(['pending', 'sent', 'refused', 'not-needed']),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  status: z.enum(['running', 'complete', 'stopped', 'hard-stopped']),
})

// ── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create an AddAuditStore with injectable dependencies.
 *
 * In production (Electron main process after app.whenReady()):
 *   const store = createAddAuditStore()   // uses real node:fs + electron.app
 *
 * In tests (inject fake fs + fake app → no disk I/O, no Electron required):
 *   const store = createAddAuditStore({ fs: fakeFs, app: fakeApp })
 */
export function createAddAuditStore(deps: AddAuditStoreDeps = {}): AddAuditStore {
  const jobFileName = deps.jobFileName ?? 'add-job.json'
  const tmpFileName = `${jobFileName}.tmp`

  /** Resolve the fs implementation (injected or lazy-required). */
  function resolveFs(): AddAuditStoreFsDeps {
    if (deps.fs) return deps.fs
    // Lazy import to avoid loading node:fs at module parse time in test env
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('node:fs') as AddAuditStoreFsDeps
  }

  /** Resolve the app implementation (injected or lazy-required from Electron). */
  function resolveApp(): AddAuditStoreAppDeps {
    if (deps.app) return deps.app
    // Lazy import to avoid loading Electron at module parse time in test env
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron') as { app: AddAuditStoreAppDeps }
    return app
  }

  /** Compute the absolute path for the job file. */
  function jobPath(): string {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { join } = require('node:path') as typeof import('node:path')
    const userData = resolveApp().getPath('userData')
    return join(userData, jobFileName)
  }

  /** Compute the absolute path for the temp file. */
  function tmpPath(): string {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { join } = require('node:path') as typeof import('node:path')
    const userData = resolveApp().getPath('userData')
    return join(userData, tmpFileName)
  }

  /**
   * Atomically write the job to disk: write to .tmp, then rename to final path.
   * Crash-safe: a crash between write and rename leaves the previous final file intact.
   * Mode 0o600 restricts file to owner-read-only (T-14-04).
   */
  function writeAtomic(job: AddJobFile): void {
    const fs = resolveFs()
    const tmp = tmpPath()
    const final = jobPath()
    fs.writeFileSync(tmp, JSON.stringify(job, null, 2), { mode: 0o600 })
    fs.renameSync(tmp, final)
  }

  // In-memory copy of the current job — keeps checkpoint/setStatus fast
  // (read-modify-write without redundant disk reads).
  let _currentJob: AddJobFile | null = null

  return {
    initJob(job: AddJobFile): void {
      _currentJob = { ...job, outcomes: [...job.outcomes] }
      writeAtomic(_currentJob)
    },

    checkpoint(dialogId: string, outcome: AddGroupOutcome): void {
      if (!_currentJob) {
        // Defensive: if in-memory state lost (e.g. called after process restart without
        // initJob), read from disk first.
        const onDisk = this.readJob()
        if (!onDisk) throw new Error('AddAuditStore.checkpoint: no active job')
        _currentJob = onDisk
      }
      // CR-01: replace any existing entry for this dialogId instead of appending a
      // duplicate. A continuation resume (D-20) can reprocess a dialog the previous
      // segment already marked 'skipped' — without this dedup, the stale entry would
      // survive on disk alongside the new outcome, corrupting add-job.json with
      // contradictory rows for the same dialog.
      const deduped = _currentJob.outcomes.filter((o) => o.dialogId !== dialogId)
      _currentJob = {
        ..._currentJob,
        outcomes: [...deduped, { ...outcome, dialogId }],
      }
      writeAtomic(_currentJob)
    },

    setStatus(status: AddJobFile['status'], completedAt?: string, dmStatus?: AddDmStatus): void {
      if (!_currentJob) {
        const onDisk = this.readJob()
        if (!onDisk) throw new Error('AddAuditStore.setStatus: no active job')
        _currentJob = onDisk
      }
      _currentJob = {
        ..._currentJob,
        status,
        ...(completedAt !== undefined ? { completedAt } : {}),
        ...(dmStatus !== undefined ? { dmStatus } : {}),
      }
      writeAtomic(_currentJob)
    },

    readJob(): AddJobFile | null {
      const fs = resolveFs()
      const path = jobPath()
      if (!fs.existsSync(path)) return null
      try {
        const raw = fs.readFileSync(path).toString('utf-8')
        const parsed: unknown = JSON.parse(raw)
        const result = AddJobFileSchema.safeParse(parsed)
        if (!result.success) return null
        return result.data as AddJobFile
      } catch {
        return null
      }
    },

    clearJob(): void {
      _currentJob = null
      const fs = resolveFs()
      const path = jobPath()
      if (fs.existsSync(path)) {
        fs.unlinkSync(path)
      }
    },

    getRemaining(): string[] {
      const job = _currentJob ?? this.readJob()
      if (!job) return []
      const done = new Set(job.outcomes.map((o) => o.dialogId))
      return job.dialogIds.filter((id) => !done.has(id))
    },
  }
}

// ── sameDialogIdSet ───────────────────────────────────────────────────────────

/**
 * Order-insensitive set-equality check over two dialogId arrays.
 *
 * Used by AddExecutor (Plan 14-09) for D-20's continuation-based resume detection:
 * a new execute() call CONTINUES an existing in-progress job (reusing its jobId and
 * outcomes) when the requested dialogIds are the same set as the persisted job's
 * dialogIds; otherwise it discards the stale job and starts a fresh one.
 *
 * Pure function — no I/O, no `this`. Order of elements in each array is irrelevant;
 * only set membership and cardinality matter.
 */
export function sameDialogIdSet(a: string[], b: string[]): boolean {
  return a.length === b.length && new Set(a).size === new Set(b).size && a.every((id) => b.includes(id))
}

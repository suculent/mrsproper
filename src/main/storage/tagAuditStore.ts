/**
 * TagAuditStore — durable job-file persistence for the tag execution engine (TAG-03).
 *
 * CONTRACT:
 * - Every group outcome is written to disk atomically (write-to-temp + rename) before
 *   moving to the next group. This guarantees crash-safety: a partial write leaves the
 *   previous valid checkpoint intact (the tmp file is orphaned, not the final file).
 * - On relaunch, readJob() returns the on-disk job (Zod-validated) or null. The caller
 *   checks status !== 'complete' to detect incomplete jobs and offer Resume/Discard.
 * - getRemaining() returns the ordered subset of dialogIds not yet covered by outcomes.
 *
 * SECURITY:
 * - Job file written with mode 0o600 (owner-read-only) — same as session.bin.
 * - targetAccessHash is stored for resume (resolver may not be live on relaunch).
 *   Access-hash is not a session credential; 0o600 is an acceptable protection level.
 *
 * THREAT T-10-03: Zod-validates TagJobFile before returning from readJob();
 * returns null on any parse/validation error — prevents injected/corrupted content.
 * THREAT T-10-04: writeAtomic passes { mode: 0o600 } to writeFileSync on every write.
 */

import { z } from 'zod'
import type { TagJobFile, TagGroupOutcome } from '@shared/tagTypes'

// ── Dependency types ────────────────────────────────────────────────────────

/** Minimal fs surface needed — injectable for tests. */
export interface TagAuditStoreFsDeps {
  writeFileSync(path: string, data: string | Buffer, opts?: unknown): void
  renameSync(from: string, to: string): void
  readFileSync(path: string): Buffer
  existsSync(path: string): boolean
  unlinkSync(path: string): void
}

/** Minimal app surface needed — injectable for tests. */
export interface TagAuditStoreAppDeps {
  getPath(name: 'userData'): string
}

/** Injectable dependencies for testability (production defaults to real electron/fs). */
export interface TagAuditStoreDeps {
  fs?: TagAuditStoreFsDeps
  app?: TagAuditStoreAppDeps
  /** Override the job file name (default: 'tag-job.json'). */
  jobFileName?: string
}

// ── TagAuditStore interface ─────────────────────────────────────────────────────

export interface TagAuditStore {
  /**
   * Write the initial job file atomically.
   * Overwrites any existing job file (rotation: complete job overwritten; incomplete
   * job overwritten on Discard + new start).
   */
  initJob(job: TagJobFile): void

  /**
   * Append a per-group outcome to the in-memory job, then atomically re-write the
   * job file to disk. Called after every group completes.
   */
  checkpoint(dialogId: string, outcome: TagGroupOutcome): void

  /**
   * Update the job's status (and optional completedAt), then atomically re-write.
   * Used by the executor when transitioning to 'complete' | 'stopped' | 'hard-stopped'.
   */
  setStatus(status: TagJobFile['status'], completedAt?: string): void

  /**
   * Read and Zod-validate the job file.
   * Returns null when:
   * - No file exists at the expected path
   * - File content is not valid JSON
   * - JSON does not match the TagJobFile schema
   */
  readJob(): TagJobFile | null

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

// ── Zod schema for job file validation (T-10-03) ──────────────────────────────

const TagGroupOutcomeSchema = z.object({
  dialogId: z.string(),
  status: z.enum(['done', 'skipped', 'failed']), // NO 'already-gone'
  errorCode: z.string().optional(),              // NO note field
  timestamp: z.string(),
})

const TagJobFileSchema = z.object({
  schemaVersion: z.literal(1),
  jobId: z.string(),
  tag: z.string(),                               // replaces severity
  targetId: z.string(),
  targetName: z.string(),
  targetAccessHash: z.string(),
  dialogIds: z.array(z.string()),
  outcomes: z.array(TagGroupOutcomeSchema),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  status: z.enum(['running', 'complete', 'stopped', 'hard-stopped']),
})

// ── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a TagAuditStore with injectable dependencies.
 *
 * In production (Electron main process after app.whenReady()):
 *   const store = createTagAuditStore()   // uses real node:fs + electron.app
 *
 * In tests (inject fake fs + fake app → no disk I/O, no Electron required):
 *   const store = createTagAuditStore({ fs: fakeFs, app: fakeApp })
 */
export function createTagAuditStore(deps: TagAuditStoreDeps = {}): TagAuditStore {
  const jobFileName = deps.jobFileName ?? 'tag-job.json'
  const tmpFileName = `${jobFileName}.tmp`

  /** Resolve the fs implementation (injected or lazy-required). */
  function resolveFs(): TagAuditStoreFsDeps {
    if (deps.fs) return deps.fs
    // Lazy import to avoid loading node:fs at module parse time in test env
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('node:fs') as TagAuditStoreFsDeps
  }

  /** Resolve the app implementation (injected or lazy-required from Electron). */
  function resolveApp(): TagAuditStoreAppDeps {
    if (deps.app) return deps.app
    // Lazy import to avoid loading Electron at module parse time in test env
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron') as { app: TagAuditStoreAppDeps }
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
   * Mode 0o600 restricts file to owner-read-only (T-10-04).
   */
  function writeAtomic(job: TagJobFile): void {
    const fs = resolveFs()
    const tmp = tmpPath()
    const final = jobPath()
    fs.writeFileSync(tmp, JSON.stringify(job, null, 2), { mode: 0o600 })
    fs.renameSync(tmp, final)
  }

  // In-memory copy of the current job — keeps checkpoint/setStatus fast
  // (read-modify-write without redundant disk reads).
  let _currentJob: TagJobFile | null = null

  return {
    initJob(job: TagJobFile): void {
      _currentJob = { ...job, outcomes: [...job.outcomes] }
      writeAtomic(_currentJob)
    },

    checkpoint(dialogId: string, outcome: TagGroupOutcome): void {
      if (!_currentJob) {
        // Defensive: if in-memory state lost (e.g. called after process restart without
        // initJob), read from disk first.
        const onDisk = this.readJob()
        if (!onDisk) throw new Error('TagAuditStore.checkpoint: no active job')
        _currentJob = onDisk
      }
      _currentJob = {
        ..._currentJob,
        outcomes: [..._currentJob.outcomes, { ...outcome, dialogId }],
      }
      writeAtomic(_currentJob)
    },

    setStatus(status: TagJobFile['status'], completedAt?: string): void {
      if (!_currentJob) {
        const onDisk = this.readJob()
        if (!onDisk) throw new Error('TagAuditStore.setStatus: no active job')
        _currentJob = onDisk
      }
      _currentJob = {
        ..._currentJob,
        status,
        ...(completedAt !== undefined ? { completedAt } : {}),
      }
      writeAtomic(_currentJob)
    },

    readJob(): TagJobFile | null {
      const fs = resolveFs()
      const path = jobPath()
      if (!fs.existsSync(path)) return null
      try {
        const raw = fs.readFileSync(path).toString('utf-8')
        const parsed: unknown = JSON.parse(raw)
        const result = TagJobFileSchema.safeParse(parsed)
        if (!result.success) return null
        return result.data as TagJobFile
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

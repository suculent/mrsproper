/**
 * AuditStore — durable job-file persistence for the removal execution engine (EXE-05).
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
 * - revokeHistory is intentionally absent: it is NOT a field in RemovalJobFile by
 *   construction (T-05-SC-1 security invariant). Cannot be injected through this path.
 *
 * THREAT T-05-03-A: Zod-validates RemovalJobFile before returning from readJob();
 * returns null on any parse/validation error — prevents injected/corrupted content.
 */

import { z } from 'zod'
import type { RemovalJobFile, RemovalGroupOutcome } from '@shared/removalTypes'

// ── Dependency types ────────────────────────────────────────────────────────

/** Minimal fs surface needed — injectable for tests. */
export interface AuditStoreFsDeps {
  writeFileSync(path: string, data: string | Buffer, opts?: unknown): void
  renameSync(from: string, to: string): void
  readFileSync(path: string): Buffer
  existsSync(path: string): boolean
  unlinkSync(path: string): void
}

/** Minimal app surface needed — injectable for tests. */
export interface AuditStoreAppDeps {
  getPath(name: 'userData'): string
}

/** Injectable dependencies for testability (production defaults to real electron/fs). */
export interface AuditStoreDeps {
  fs?: AuditStoreFsDeps
  app?: AuditStoreAppDeps
  /** Override the job file name (default: 'removal-job.json'). */
  jobFileName?: string
}

// ── AuditStore interface ─────────────────────────────────────────────────────

export interface AuditStore {
  /**
   * Write the initial job file atomically.
   * Overwrites any existing job file (rotation: complete job overwritten; incomplete
   * job overwritten on Discard + new start).
   */
  initJob(job: RemovalJobFile): void

  /**
   * Append a per-group outcome to the in-memory job, then atomically re-write the
   * job file to disk. Called after every group completes.
   */
  checkpoint(dialogId: string, outcome: RemovalGroupOutcome): void

  /**
   * Update the job's status (and optional completedAt), then atomically re-write.
   * Used by the executor when transitioning to 'complete' | 'stopped' | 'hard-stopped'.
   */
  setStatus(status: RemovalJobFile['status'], completedAt?: string): void

  /**
   * Read and Zod-validate the job file.
   * Returns null when:
   * - No file exists at the expected path
   * - File content is not valid JSON
   * - JSON does not match the RemovalJobFile schema
   */
  readJob(): RemovalJobFile | null

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

// ── Zod schema for job file validation (T-05-03-A) ──────────────────────────

const RemovalGroupOutcomeSchema = z.object({
  dialogId: z.string(),
  status: z.enum(['done', 'already-gone', 'failed', 'skipped']),
  errorCode: z.string().optional(),
  note: z.union([z.literal('basic-group-ban-fallback'), z.null()]).optional(),
  timestamp: z.string(),
})

const RemovalJobFileSchema = z.object({
  schemaVersion: z.literal(1),
  jobId: z.string(),
  severity: z.enum(['kick', 'ban']),
  targetId: z.string(),
  targetName: z.string(),
  targetAccessHash: z.string(),
  dialogIds: z.array(z.string()),
  outcomes: z.array(RemovalGroupOutcomeSchema),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  status: z.enum(['running', 'complete', 'stopped', 'hard-stopped']),
})

// ── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create an AuditStore with injectable dependencies.
 *
 * In production (Electron main process after app.whenReady()):
 *   const store = createAuditStore()   // uses real node:fs + electron.app
 *
 * In tests (inject fake fs + fake app → no disk I/O, no Electron required):
 *   const store = createAuditStore({ fs: fakeFs, app: fakeApp })
 */
export function createAuditStore(deps: AuditStoreDeps = {}): AuditStore {
  const jobFileName = deps.jobFileName ?? 'removal-job.json'
  const tmpFileName = `${jobFileName}.tmp`

  /** Resolve the fs implementation (injected or lazy-required). */
  function resolveFs(): AuditStoreFsDeps {
    if (deps.fs) return deps.fs
    // Lazy import to avoid loading node:fs at module parse time in test env
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('node:fs') as AuditStoreFsDeps
  }

  /** Resolve the app implementation (injected or lazy-required from Electron). */
  function resolveApp(): AuditStoreAppDeps {
    if (deps.app) return deps.app
    // Lazy import to avoid loading Electron at module parse time in test env
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron') as { app: AuditStoreAppDeps }
    return app
  }

  /** Compute the absolute path for the job file or tmp file. */
  function jobPath(): string {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { join } = require('node:path') as typeof import('node:path')
    const userData = resolveApp().getPath('userData')
    return join(userData, jobFileName)
  }

  function tmpPath(): string {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { join } = require('node:path') as typeof import('node:path')
    const userData = resolveApp().getPath('userData')
    return join(userData, tmpFileName)
  }

  /**
   * Atomically write the job to disk: write to .tmp, then rename to final path.
   * Crash-safe: a crash between write and rename leaves the previous final file intact.
   */
  function writeAtomic(job: RemovalJobFile): void {
    const fs = resolveFs()
    const tmp = tmpPath()
    const final = jobPath()
    fs.writeFileSync(tmp, JSON.stringify(job, null, 2), { mode: 0o600 })
    fs.renameSync(tmp, final)
  }

  // In-memory copy of the current job — keeps checkpoint/setStatus fast
  // (read-modify-write without redundant disk reads).
  let _currentJob: RemovalJobFile | null = null

  return {
    initJob(job: RemovalJobFile): void {
      _currentJob = { ...job, outcomes: [...job.outcomes] }
      writeAtomic(_currentJob)
    },

    checkpoint(dialogId: string, outcome: RemovalGroupOutcome): void {
      if (!_currentJob) {
        // Defensive: if in-memory state lost (e.g. called after process restart without
        // initJob), read from disk first.
        const onDisk = this.readJob()
        if (!onDisk) throw new Error('AuditStore.checkpoint: no active job')
        _currentJob = onDisk
      }
      _currentJob = {
        ..._currentJob,
        outcomes: [..._currentJob.outcomes, { ...outcome, dialogId }],
      }
      writeAtomic(_currentJob)
    },

    setStatus(status: RemovalJobFile['status'], completedAt?: string): void {
      if (!_currentJob) {
        const onDisk = this.readJob()
        if (!onDisk) throw new Error('AuditStore.setStatus: no active job')
        _currentJob = onDisk
      }
      _currentJob = {
        ..._currentJob,
        status,
        ...(completedAt !== undefined ? { completedAt } : {}),
      }
      writeAtomic(_currentJob)
    },

    readJob(): RemovalJobFile | null {
      const fs = resolveFs()
      const path = jobPath()
      if (!fs.existsSync(path)) return null
      try {
        const raw = fs.readFileSync(path).toString('utf-8')
        const parsed: unknown = JSON.parse(raw)
        const result = RemovalJobFileSchema.safeParse(parsed)
        if (!result.success) return null
        return result.data as RemovalJobFile
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

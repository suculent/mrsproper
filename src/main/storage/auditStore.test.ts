/**
 * Tests for AuditStore.ts (EXE-05 job durability).
 *
 * Test map:
 *   - Atomic write: initJob uses temp-file-then-rename pattern (crash safety)
 *   - Checkpoint: appends outcome to job file outcomes array after each group
 *   - readJob: returns null when no job file present
 *   - readJob: returns null when file contains invalid JSON (malformed)
 *   - readJob: validates schema with Zod before returning; rejects unknown shape
 *   - Incomplete job detection: readJob returns job with status=running
 *   - Resume: remaining dialogIds = full list minus completed outcomes dialogIds
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { createAuditStore } from './auditStore'
import type { RemovalJobFile, RemovalGroupOutcome } from '@shared/removalTypes'

// ── In-memory fake fs ─────────────────────────────────────────────────────────

/**
 * Fake fs for injection into AuditStoreDeps.
 * Stores files as strings (the full byte-content), keyed by absolute path.
 * Tracks the rename sequence to verify atomic write pattern.
 */
function createFakeFs() {
  const files: Record<string, string> = {}
  const renames: Array<{ from: string; to: string }> = []

  const fakeFs = {
    writeFileSync(path: string, data: string | Buffer, _opts?: unknown): void {
      files[path] = typeof data === 'string' ? data : data.toString('utf-8')
    },
    renameSync(from: string, to: string): void {
      if (files[from] === undefined) throw new Error(`ENOENT: no such file: ${from}`)
      files[to] = files[from]!
      delete files[from]
      renames.push({ from, to })
    },
    readFileSync(path: string): Buffer {
      const content = files[path]
      if (content === undefined) throw new Error(`ENOENT: no such file: ${path}`)
      return Buffer.from(content, 'utf-8')
    },
    existsSync(path: string): boolean {
      return path in files
    },
    unlinkSync(path: string): void {
      delete files[path]
    },
    // Test helpers — not part of AuditStoreDeps interface
    _files: files,
    _renames: renames,
  }

  return fakeFs
}

function createFakeApp(userDataPath = '/fake/userData') {
  return {
    getPath(_name: 'userData') {
      return userDataPath
    },
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<RemovalJobFile> = {}): RemovalJobFile {
  return {
    schemaVersion: 1,
    jobId: '2026-06-12T14:32:00.000Z',
    severity: 'ban',
    targetId: '123456789',
    targetName: 'Anna Nováková',
    targetAccessHash: '9876543210',
    dialogIds: ['111', '222', '333'],
    outcomes: [],
    startedAt: '2026-06-12T14:32:00.000Z',
    status: 'running',
    ...overrides,
  }
}

function makeOutcome(dialogId: string): RemovalGroupOutcome {
  return {
    dialogId,
    status: 'done',
    timestamp: '2026-06-12T14:32:01.000Z',
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AuditStore', () => {
  let fakeFs: ReturnType<typeof createFakeFs>
  let fakeApp: ReturnType<typeof createFakeApp>
  const USER_DATA = '/fake/userData'
  const FINAL_PATH = `${USER_DATA}/removal-job.json`
  const TMP_PATH = `${USER_DATA}/removal-job.json.tmp`

  beforeEach(() => {
    fakeFs = createFakeFs()
    fakeApp = createFakeApp(USER_DATA)
  })

  it('writeJob: atomic write (temp file renamed to final path)', () => {
    const store = createAuditStore({ fs: fakeFs, app: fakeApp })
    const job = makeJob()

    store.initJob(job)

    // Temp file should have been cleaned up (renamed to final)
    expect(fakeFs._files[TMP_PATH]).toBeUndefined()
    // Final file must exist
    expect(fakeFs._files[FINAL_PATH]).toBeDefined()
    // At least one rename from tmp → final was recorded
    expect(fakeFs._renames).toContainEqual({ from: TMP_PATH, to: FINAL_PATH })
    // Content round-trips
    const written = JSON.parse(fakeFs._files[FINAL_PATH]!) as RemovalJobFile
    expect(written.jobId).toBe(job.jobId)
    expect(written.severity).toBe('ban')
    expect(written.dialogIds).toEqual(['111', '222', '333'])
  })

  it('checkpoint: appends outcome to job file outcomes array', () => {
    const store = createAuditStore({ fs: fakeFs, app: fakeApp })
    const job = makeJob()
    store.initJob(job)

    const outcome = makeOutcome('111')
    store.checkpoint('111', outcome)

    const written = JSON.parse(fakeFs._files[FINAL_PATH]!) as RemovalJobFile
    expect(written.outcomes).toHaveLength(1)
    expect(written.outcomes[0]!.dialogId).toBe('111')
    expect(written.outcomes[0]!.status).toBe('done')

    // Second checkpoint appends (does not overwrite)
    store.checkpoint('222', makeOutcome('222'))
    const written2 = JSON.parse(fakeFs._files[FINAL_PATH]!) as RemovalJobFile
    expect(written2.outcomes).toHaveLength(2)
    expect(written2.outcomes[1]!.dialogId).toBe('222')
  })

  it('readJob: returns null when no job file present', () => {
    const store = createAuditStore({ fs: fakeFs, app: fakeApp })
    // No file written
    expect(store.readJob()).toBeNull()
  })

  it('readJob: returns null when file contains invalid JSON (malformed)', () => {
    // Write garbage directly via fakeFs
    fakeFs._files[FINAL_PATH] = '{ this is not valid json }'
    const store = createAuditStore({ fs: fakeFs, app: fakeApp })
    expect(store.readJob()).toBeNull()
  })

  it('readJob: validates schema with Zod before returning; rejects unknown shape', () => {
    // Missing required field 'severity'
    const badJob = {
      schemaVersion: 1,
      jobId: '2026-06-12T14:00:00.000Z',
      // severity is missing
      targetId: '123',
      targetName: 'Tester',
      targetAccessHash: '456',
      dialogIds: [],
      outcomes: [],
      startedAt: '2026-06-12T14:00:00.000Z',
      status: 'running',
    }
    fakeFs._files[FINAL_PATH] = JSON.stringify(badJob)
    const store = createAuditStore({ fs: fakeFs, app: fakeApp })
    expect(store.readJob()).toBeNull()
  })

  it('incomplete job detection: readJob returns job with status=running', () => {
    const store = createAuditStore({ fs: fakeFs, app: fakeApp })
    const job = makeJob({ status: 'running' })
    store.initJob(job)

    const read = store.readJob()
    expect(read).not.toBeNull()
    expect(read!.status).toBe('running')
  })

  it('resume: remaining dialogIds = full list minus completed outcomes dialogIds', () => {
    const store = createAuditStore({ fs: fakeFs, app: fakeApp })
    const job = makeJob({ dialogIds: ['111', '222', '333'] })
    store.initJob(job)
    store.checkpoint('111', makeOutcome('111'))
    store.checkpoint('222', makeOutcome('222'))

    const remaining = store.getRemaining()
    // '111' and '222' are done; only '333' should remain
    expect(remaining).toEqual(['333'])
  })
})

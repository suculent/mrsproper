/**
 * Tests for tagAuditStore.ts (TAG-03 job durability).
 *
 * Test map:
 *   - writeJob: writes to tmp path then renames to final path (atomic write)
 *   - checkpoint: appends outcome to job file outcomes array after each group
 *   - readJob: returns null when no job file present
 *   - readJob: returns null when file contains invalid JSON
 *   - readJob: validates schema with Zod; rejects unknown shape
 *   - incomplete job detection: readJob returns job with status running
 *   - getRemaining: returns dialogIds not yet in outcomes
 *   - 0o600 mode: initJob writes with mode 0o600
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { createTagAuditStore } from './tagAuditStore'
import type { TagJobFile, TagGroupOutcome } from '@shared/tagTypes'

// ── In-memory fake fs ─────────────────────────────────────────────────────────

/**
 * Fake fs for injection into TagAuditStoreDeps.
 * Stores files as strings (the full byte-content), keyed by absolute path.
 * Tracks the rename sequence to verify atomic write pattern.
 * Captures the last write opts to verify 0o600 mode.
 */
function createFakeFs() {
  const files: Record<string, string> = {}
  const renames: Array<{ from: string; to: string }> = []
  let _lastWriteOpts: unknown

  const fakeFs = {
    writeFileSync(path: string, data: string | Buffer, opts?: unknown): void {
      files[path] = typeof data === 'string' ? data : data.toString('utf-8')
      _lastWriteOpts = opts
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
    // Test helpers — not part of TagAuditStoreDeps interface
    _files: files,
    _renames: renames,
    get _lastWriteOpts() {
      return _lastWriteOpts
    },
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

function makeTagJob(overrides: Partial<TagJobFile> = {}): TagJobFile {
  return {
    schemaVersion: 1,
    jobId: '2026-06-20T14:32:00.000Z',
    tag: 'TestTag',
    targetId: '123456789',
    targetName: 'Anna Nováková',
    targetAccessHash: '9876543210',
    dialogIds: ['111', '222', '333'],
    outcomes: [],
    startedAt: '2026-06-20T14:32:00.000Z',
    status: 'running',
    ...overrides,
  }
}

function makeOutcome(dialogId: string): TagGroupOutcome {
  return {
    dialogId,
    status: 'done',
    timestamp: '2026-06-20T14:32:01.000Z',
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TagAuditStore', () => {
  let fakeFs: ReturnType<typeof createFakeFs>
  let fakeApp: ReturnType<typeof createFakeApp>
  const USER_DATA = '/fake/userData'
  const FINAL_PATH = `${USER_DATA}/tag-job.json`
  const TMP_PATH = `${USER_DATA}/tag-job.json.tmp`

  beforeEach(() => {
    fakeFs = createFakeFs()
    fakeApp = createFakeApp(USER_DATA)
  })

  it('writeJob: writes to tmp path then renames to final path', () => {
    const store = createTagAuditStore({ fs: fakeFs, app: fakeApp })
    const job = makeTagJob()

    store.initJob(job)

    // Temp file should have been cleaned up (renamed to final)
    expect(fakeFs._files[TMP_PATH]).toBeUndefined()
    // Final file must exist
    expect(fakeFs._files[FINAL_PATH]).toBeDefined()
    // At least one rename from tmp → final was recorded
    expect(fakeFs._renames).toContainEqual({ from: TMP_PATH, to: FINAL_PATH })
  })

  it('checkpoint: appends outcome to job file outcomes array', () => {
    const store = createTagAuditStore({ fs: fakeFs, app: fakeApp })
    const job = makeTagJob()
    store.initJob(job)

    store.checkpoint('111', makeOutcome('111'))
    store.checkpoint('222', makeOutcome('222'))

    const written = JSON.parse(fakeFs._files[FINAL_PATH]!) as TagJobFile
    expect(written.outcomes).toHaveLength(2)
    expect(written.outcomes[0]!.dialogId).toBe('111')
    expect(written.outcomes[1]!.dialogId).toBe('222')
  })

  it('readJob: returns null when no job file present', () => {
    const store = createTagAuditStore({ fs: fakeFs, app: fakeApp })
    // No file written
    expect(store.readJob()).toBeNull()
  })

  it('readJob: returns null when file contains invalid JSON', () => {
    // Write garbage directly via fakeFs
    fakeFs._files[FINAL_PATH] = 'not-json'
    const store = createTagAuditStore({ fs: fakeFs, app: fakeApp })
    expect(store.readJob()).toBeNull()
  })

  it('readJob: validates schema with Zod; rejects unknown shape', () => {
    // Missing required field 'tag'
    const badJob = {
      schemaVersion: 1,
      jobId: '2026-06-20T14:00:00.000Z',
      // tag is missing
      targetId: '123',
      targetName: 'Tester',
      targetAccessHash: '456',
      dialogIds: [],
      outcomes: [],
      startedAt: '2026-06-20T14:00:00.000Z',
      status: 'running',
    }
    fakeFs._files[FINAL_PATH] = JSON.stringify(badJob)
    const store = createTagAuditStore({ fs: fakeFs, app: fakeApp })
    expect(store.readJob()).toBeNull()
  })

  it('incomplete job detection: readJob returns job with status running', () => {
    const store = createTagAuditStore({ fs: fakeFs, app: fakeApp })
    const job = makeTagJob({ status: 'running' })
    store.initJob(job)

    const read = store.readJob()
    expect(read).not.toBeNull()
    expect(read!.status).toBe('running')
  })

  it('getRemaining: returns dialogIds not yet in outcomes', () => {
    const store = createTagAuditStore({ fs: fakeFs, app: fakeApp })
    const job = makeTagJob({ dialogIds: ['111', '222', '333'] })
    store.initJob(job)
    store.checkpoint('111', makeOutcome('111'))

    const remaining = store.getRemaining()
    expect(remaining).toEqual(['222', '333'])
  })

  it('0o600 mode: initJob writes with mode 0o600', () => {
    const store = createTagAuditStore({ fs: fakeFs, app: fakeApp })
    const job = makeTagJob()

    store.initJob(job)

    expect(fakeFs._lastWriteOpts).toMatchObject({ mode: 0o600 })
  })
})

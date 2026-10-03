/**
 * Tests for addAuditStore.ts (ADD-08 job durability).
 *
 * Test map:
 *   - initJob: writes to tmp path then renames to final path (atomic write)
 *   - checkpoint: appends outcome (including link/reason/premiumWouldAllow) to job file
 *   - readJob: returns null when no job file present
 *   - readJob: returns null when file contains invalid JSON
 *   - readJob: rejects a job file missing the dmStatus field (schema mismatch)
 *   - setStatus: updates status and completedAt, preserves dmStatus and outcomes
 *   - getRemaining: returns dialogIds not yet in outcomes, preserving original order
 *   - 0o600 mode: initJob writes with mode 0o600
 *   - sameDialogIdSet: order-insensitive set-equality helper (D-20 continuation detection)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { createAddAuditStore, sameDialogIdSet } from './addAuditStore'
import type { AddJobFile, AddGroupOutcome } from '@shared/addTypes'

// ── In-memory fake fs ─────────────────────────────────────────────────────────

/**
 * Fake fs for injection into AddAuditStoreDeps.
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
    // Test helpers — not part of AddAuditStoreDeps interface
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

function makeAddJob(overrides: Partial<AddJobFile> = {}): AddJobFile {
  return {
    schemaVersion: 1,
    jobId: '2026-10-03T14:32:00.000Z',
    targetId: '123456789',
    targetName: 'Jan Novák',
    targetAccessHash: '9876543210',
    dialogIds: ['111', '222', '333'],
    outcomes: [],
    dmStatus: 'pending',
    startedAt: '2026-10-03T14:32:00.000Z',
    status: 'running',
    ...overrides,
  }
}

function makeOutcome(dialogId: string, overrides: Partial<AddGroupOutcome> = {}): AddGroupOutcome {
  return {
    dialogId,
    status: 'done',
    timestamp: '2026-10-03T14:32:01.000Z',
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AddAuditStore', () => {
  let fakeFs: ReturnType<typeof createFakeFs>
  let fakeApp: ReturnType<typeof createFakeApp>
  const USER_DATA = '/fake/userData'
  const FINAL_PATH = `${USER_DATA}/add-job.json`
  const TMP_PATH = `${USER_DATA}/add-job.json.tmp`

  beforeEach(() => {
    fakeFs = createFakeFs()
    fakeApp = createFakeApp(USER_DATA)
  })

  it('initJob: writes to tmp path then renames to final path', () => {
    const store = createAddAuditStore({ fs: fakeFs, app: fakeApp })
    const job = makeAddJob()

    store.initJob(job)

    expect(fakeFs._files[TMP_PATH]).toBeUndefined()
    expect(fakeFs._files[FINAL_PATH]).toBeDefined()
    expect(fakeFs._renames).toContainEqual({ from: TMP_PATH, to: FINAL_PATH })
  })

  it('checkpoint: appends outcome (including link/reason/premiumWouldAllow) to job file outcomes array', () => {
    const store = createAddAuditStore({ fs: fakeFs, app: fakeApp })
    const job = makeAddJob()
    store.initJob(job)

    store.checkpoint(
      '111',
      makeOutcome('111', {
        status: 'privacy-blocked',
        reason: 'channel-full',
        link: 'https://t.me/+mocklink',
        premiumWouldAllow: true,
      })
    )

    const read = store.readJob()
    expect(read).not.toBeNull()
    expect(read!.outcomes).toHaveLength(1)
    expect(read!.outcomes[0]!.link).toBe('https://t.me/+mocklink')
    expect(read!.outcomes[0]!.reason).toBe('channel-full')
    expect(read!.outcomes[0]!.premiumWouldAllow).toBe(true)
  })

  it('readJob: returns null when no job file present', () => {
    const store = createAddAuditStore({ fs: fakeFs, app: fakeApp })
    expect(store.readJob()).toBeNull()
  })

  it('readJob: returns null when file contains invalid JSON', () => {
    fakeFs._files[FINAL_PATH] = 'not-json'
    const store = createAddAuditStore({ fs: fakeFs, app: fakeApp })
    expect(store.readJob()).toBeNull()
  })

  it('readJob: rejects a job file missing the dmStatus field (schema mismatch)', () => {
    const badJob = {
      schemaVersion: 1,
      jobId: '2026-10-03T14:00:00.000Z',
      targetId: '123',
      targetName: 'Tester',
      targetAccessHash: '456',
      dialogIds: [],
      outcomes: [],
      // dmStatus intentionally omitted — required field in AddJobFile
      startedAt: '2026-10-03T14:00:00.000Z',
      status: 'running',
    }
    fakeFs._files[FINAL_PATH] = JSON.stringify(badJob)
    const store = createAddAuditStore({ fs: fakeFs, app: fakeApp })
    expect(store.readJob()).toBeNull()
  })

  it('setStatus: updates status and completedAt, preserves dmStatus and outcomes', () => {
    const store = createAddAuditStore({ fs: fakeFs, app: fakeApp })
    const job = makeAddJob({ dmStatus: 'sent' })
    store.initJob(job)
    store.checkpoint('111', makeOutcome('111'))

    const completedAt = '2026-10-03T15:00:00.000Z'
    store.setStatus('complete', completedAt)

    const read = store.readJob()
    expect(read).not.toBeNull()
    expect(read!.status).toBe('complete')
    expect(read!.completedAt).toBe(completedAt)
    expect(read!.dmStatus).toBe('sent')
    expect(read!.outcomes).toHaveLength(1)
  })

  it('getRemaining: returns dialogIds not yet in outcomes, preserving original order', () => {
    const store = createAddAuditStore({ fs: fakeFs, app: fakeApp })
    const job = makeAddJob({ dialogIds: ['111', '222', '333'] })
    store.initJob(job)
    store.checkpoint('111', makeOutcome('111'))

    const remaining = store.getRemaining()
    expect(remaining).toEqual(['222', '333'])
  })

  it('0o600 mode: initJob writes with mode 0o600', () => {
    const store = createAddAuditStore({ fs: fakeFs, app: fakeApp })
    const job = makeAddJob()

    store.initJob(job)

    expect(fakeFs._lastWriteOpts).toMatchObject({ mode: 0o600 })
  })

  it('sameDialogIdSet: returns true for the same ids in different order', () => {
    expect(sameDialogIdSet(['1', '2', '3'], ['3', '1', '2'])).toBe(true)
  })

  it('sameDialogIdSet: returns false when the sets differ in length or membership', () => {
    expect(sameDialogIdSet(['1', '2'], ['1', '2', '3'])).toBe(false)
    expect(sameDialogIdSet(['1', '2'], ['1', '4'])).toBe(false)
  })

  it('sameDialogIdSet: returns true for two empty arrays', () => {
    expect(sameDialogIdSet([], [])).toBe(true)
  })
})

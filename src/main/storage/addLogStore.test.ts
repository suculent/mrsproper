/**
 * Tests for addLogStore.ts (D-17/D-18/ADD-14 main half).
 *
 * Unlike every existing storage module (auditStore.ts, tagAuditStore.ts), this store
 * never overwrites or rewrites prior content — it only appends new blocks via
 * fs.appendFileSync, so the atomic write-to-temp-then-rename pattern does not apply.
 *
 * Test map:
 *   1. appendFileSync (not writeFileSync) called with mode 0o600
 *   2. writes to add-log.txt in userData
 *   3. block includes targetId, targetName, jobId, dmStatus as readable text
 *   4. addedDialogs listed; linkedDialogs listed WITH their link text
 *   5. two sequential calls produce two blocks, neither overwriting the other
 *   6. follow-up block (isFollowUp: true) is visually marked + shows original jobId
 *   7. dmStatus 'not-needed' rendered distinctly from 'sent' and 'refused'
 *   8. entry with empty addedDialogs/linkedDialogs still writes a block
 */

import { describe, it, expect } from 'vitest'
import { createAddLogStore } from './addLogStore'
import type { AddLogBlockEntry } from '@shared/addTypes'

// ── In-memory fake fs ─────────────────────────────────────────────────────────

/**
 * Fake fs for injection into AddLogStoreDeps.
 * Records every appendFileSync call and accumulates content per path — append-only,
 * mirroring the real fs.appendFileSync contract (never truncates).
 */
function createFakeFs() {
  const _appends: Array<{ path: string; data: string; opts?: unknown }> = []
  const _contents: Record<string, string> = {}
  const _chmodCalls: Array<{ path: string; mode: number }> = []

  return {
    appendFileSync(path: string, data: string, opts?: unknown): void {
      _appends.push({ path, data, opts })
      _contents[path] = (_contents[path] ?? '') + data
    },
    existsSync(path: string): boolean {
      return path in _contents
    },
    chmodSync(path: string, mode: number): void {
      _chmodCalls.push({ path, mode })
    },
    _appends,
    _contents,
    _chmodCalls,
  }
}

function createFakeApp() {
  return {
    getPath(_name: 'userData'): string {
      return '/fake/userData'
    },
  }
}

function makeEntry(overrides?: Partial<AddLogBlockEntry>): AddLogBlockEntry {
  return {
    jobId: '2026-10-03T14:32:00.000Z',
    isFollowUp: false,
    targetId: '123456789',
    targetName: 'Jan Novák',
    addedDialogs: [{ dialogId: '111', title: 'Group One' }],
    linkedDialogs: [{ dialogId: '222', title: 'Group Two', link: 'https://t.me/+abc123' }],
    dmStatus: 'sent',
    timestamp: '2026-10-03T14:40:00.000Z',
    ...overrides,
  }
}

describe('addLogStore', () => {
  it('appendBlock: calls fs.appendFileSync (not writeFileSync) with mode 0o600', () => {
    const fakeFs = createFakeFs()
    const store = createAddLogStore({ fs: fakeFs, app: createFakeApp() })

    store.appendBlock(makeEntry())

    expect(fakeFs._appends).toHaveLength(1)
    expect(fakeFs._appends[0]!.opts).toEqual({ mode: 0o600 })
  })

  it('appendBlock: writes to add-log.txt in userData', () => {
    const fakeFs = createFakeFs()
    const store = createAddLogStore({ fs: fakeFs, app: createFakeApp() })

    store.appendBlock(makeEntry())

    expect(fakeFs._appends[0]!.path.endsWith('/add-log.txt')).toBe(true)
  })

  it('appendBlock: block includes targetId, targetName, jobId, and dmStatus as readable text', () => {
    const fakeFs = createFakeFs()
    const store = createAddLogStore({ fs: fakeFs, app: createFakeApp() })

    store.appendBlock(makeEntry())

    const text = fakeFs._appends[0]!.data
    expect(text).toContain('123456789')
    expect(text).toContain('Jan Novák')
    expect(text).toContain('2026-10-03T14:32:00.000Z')
    expect(text).toContain('sent')
  })

  it('appendBlock: addedDialogs are listed; linkedDialogs are listed WITH their link text', () => {
    const fakeFs = createFakeFs()
    const store = createAddLogStore({ fs: fakeFs, app: createFakeApp() })

    store.appendBlock(makeEntry())

    const text = fakeFs._appends[0]!.data
    expect(text).toContain('Group One')
    expect(text).toContain('Group Two')
    expect(text).toContain('https://t.me/+abc123')
  })

  it('appendBlock: two sequential calls produce two blocks, neither overwriting the other', () => {
    const fakeFs = createFakeFs()
    const store = createAddLogStore({ fs: fakeFs, app: createFakeApp() })

    store.appendBlock(makeEntry({ jobId: 'job-one' }))
    store.appendBlock(makeEntry({ jobId: 'job-two' }))

    const path = fakeFs._appends[0]!.path
    expect(fakeFs._contents[path]).toContain('job-one')
    expect(fakeFs._contents[path]).toContain('job-two')
  })

  it('appendBlock: a follow-up block (isFollowUp: true) is visually marked and still shows the original jobId', () => {
    const fakeFs = createFakeFs()
    const store = createAddLogStore({ fs: fakeFs, app: createFakeApp() })

    store.appendBlock(makeEntry({ isFollowUp: true, jobId: 'original-job-id' }))

    const text = fakeFs._appends[0]!.data
    expect(text).toContain('CONTINUATION')
    expect(text).toContain('original-job-id')
  })

  it('appendBlock: dmStatus "not-needed" is rendered distinctly from "sent" and "refused"', () => {
    const fakeFs = createFakeFs()
    const store = createAddLogStore({ fs: fakeFs, app: createFakeApp() })

    store.appendBlock(makeEntry({ dmStatus: 'not-needed' }))
    store.appendBlock(makeEntry({ dmStatus: 'sent' }))
    store.appendBlock(makeEntry({ dmStatus: 'refused' }))

    const [notNeeded, sent, refused] = fakeFs._appends.map((a) => a.data)
    expect(notNeeded).toContain('not-needed')
    expect(sent).toContain('sent')
    expect(refused).toContain('refused')
    expect(notNeeded).not.toBe(sent)
    expect(sent).not.toBe(refused)
    expect(notNeeded).not.toBe(refused)
  })

  it('WR-04: when add-log.txt already exists before the first append this session, chmodSync(path, 0o600) is called defensively once', () => {
    const fakeFs = createFakeFs()
    // Simulate a pre-existing add-log.txt (e.g. restored from a backup) whose permissions
    // were never set by this store's own appendFileSync({ mode }) call.
    fakeFs._contents['/fake/userData/add-log.txt'] = 'pre-existing content\n'
    const store = createAddLogStore({ fs: fakeFs, app: createFakeApp() })

    store.appendBlock(makeEntry())
    store.appendBlock(makeEntry())

    expect(fakeFs._chmodCalls).toHaveLength(1)
    expect(fakeFs._chmodCalls[0]).toEqual({ path: '/fake/userData/add-log.txt', mode: 0o600 })
  })

  it('WR-04: when add-log.txt does not exist yet, chmodSync is never called (appendFileSync creating it at 0o600 is sufficient)', () => {
    const fakeFs = createFakeFs()
    const store = createAddLogStore({ fs: fakeFs, app: createFakeApp() })

    store.appendBlock(makeEntry())

    expect(fakeFs._chmodCalls).toHaveLength(0)
  })

  it('appendBlock: an entry with empty addedDialogs and empty linkedDialogs still writes a block (zero-added run is still logged)', () => {
    const fakeFs = createFakeFs()
    const store = createAddLogStore({ fs: fakeFs, app: createFakeApp() })

    store.appendBlock(makeEntry({ addedDialogs: [], linkedDialogs: [] }))

    expect(fakeFs._appends).toHaveLength(1)
    expect(fakeFs._appends[0]!.data.length).toBeGreaterThan(0)
  })

  it('getLogPath: returns a string ending in the log file name', () => {
    const fakeFs = createFakeFs()
    const store = createAddLogStore({ fs: fakeFs, app: createFakeApp() })

    expect(store.getLogPath().endsWith('/add-log.txt')).toBe(true)
  })
})

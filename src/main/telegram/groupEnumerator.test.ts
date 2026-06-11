/**
 * RED→GREEN tests for GroupEnumerator.ts (GRP-04, GRP-05).
 *
 * Test map:
 *   - GRP-04: type detection and rights detection (canAct logic)
 *   - GRP-05: dialog entity classification (Chat, Channel megagroup, Channel broadcast)
 */

import { describe, it, expect, vi } from 'vitest'
import { createMockTelegramClient } from './__mocks__/telegramClient'
import { RateLimitGovernor } from './governor'
import { GroupEnumerator } from './GroupEnumerator'
import type { GroupsState } from '@shared/groupTypes'

// ---------------------------------------------------------------------------
// Test factory
// ---------------------------------------------------------------------------

function makeEnumerator(config: Parameters<typeof createMockTelegramClient>[0]) {
  const client = createMockTelegramClient(config)
  const governor = new RateLimitGovernor({ client })
  const emitted: GroupsState[] = []
  const enumerator = new GroupEnumerator({
    client,
    governor,
    onStateChange: (s) => emitted.push(s),
  })
  return { enumerator, emitted }
}

// ---------------------------------------------------------------------------
// GRP-05, GRP-04 — type detection: Api.Chat (basic group)
// ---------------------------------------------------------------------------

describe('type detection — Api.Chat entity', () => {
  it('classifies Chat as basic-group', async () => {
    const { enumerator, emitted } = makeEnumerator({
      getDialogsResult: [{ entity: 'Chat', id: '100', title: 'My Group', creator: false }],
    })
    await enumerator.enumerateAtLogin()
    const loaded = emitted.find((s) => s.step === 'loaded')
    expect(loaded?.step).toBe('loaded')
    if (loaded?.step === 'loaded') {
      expect(loaded.dialogs[0].type).toBe('basic-group')
    }
  })

  it('canAct=true when entity.creator=true', async () => {
    const { enumerator, emitted } = makeEnumerator({
      getDialogsResult: [{ entity: 'Chat', id: '101', title: 'Creator Group', creator: true }],
    })
    await enumerator.enumerateAtLogin()
    const loaded = emitted.find((s) => s.step === 'loaded')
    if (loaded?.step === 'loaded') {
      expect(loaded.dialogs[0].canAct).toBe(true)
      expect(loaded.dialogs[0].greyReason).toBeNull()
    }
  })

  it('canAct=true when entity.adminRights.banUsers=true (OQ-2 OR logic)', async () => {
    const { enumerator, emitted } = makeEnumerator({
      getDialogsResult: [
        {
          entity: 'Chat',
          id: '102',
          title: 'Admin Group',
          creator: false,
          adminRights: { banUsers: true },
        },
      ],
    })
    await enumerator.enumerateAtLogin()
    const loaded = emitted.find((s) => s.step === 'loaded')
    if (loaded?.step === 'loaded') {
      expect(loaded.dialogs[0].canAct).toBe(true)
      expect(loaded.dialogs[0].greyReason).toBeNull()
    }
  })

  it('canAct=false when neither creator nor banUsers', async () => {
    const { enumerator, emitted } = makeEnumerator({
      getDialogsResult: [{ entity: 'Chat', id: '103', title: 'Member Group', creator: false }],
    })
    await enumerator.enumerateAtLogin()
    const loaded = emitted.find((s) => s.step === 'loaded')
    if (loaded?.step === 'loaded') {
      expect(loaded.dialogs[0].canAct).toBe(false)
      expect(loaded.dialogs[0].greyReason).toBe('not-creator')
    }
  })
})

// ---------------------------------------------------------------------------
// GRP-05, GRP-04 — type detection: Api.Channel megagroup (supergroup)
// ---------------------------------------------------------------------------

describe('type detection — Api.Channel megagroup', () => {
  it('classifies megagroup Channel as supergroup', async () => {
    const { enumerator, emitted } = makeEnumerator({
      getDialogsResult: [{ entity: 'Channel', id: '200', title: 'Supergroup', megagroup: true }],
    })
    await enumerator.enumerateAtLogin()
    const loaded = emitted.find((s) => s.step === 'loaded')
    if (loaded?.step === 'loaded') {
      expect(loaded.dialogs[0].type).toBe('supergroup')
    }
  })

  it('canAct=true when adminRights.banUsers=true', async () => {
    const { enumerator, emitted } = makeEnumerator({
      getDialogsResult: [
        {
          entity: 'Channel',
          id: '201',
          title: 'Admin Supergroup',
          megagroup: true,
          adminRights: { banUsers: true },
        },
      ],
    })
    await enumerator.enumerateAtLogin()
    const loaded = emitted.find((s) => s.step === 'loaded')
    if (loaded?.step === 'loaded') {
      expect(loaded.dialogs[0].canAct).toBe(true)
      expect(loaded.dialogs[0].greyReason).toBeNull()
    }
  })

  it('canAct=false when adminRights.banUsers absent', async () => {
    const { enumerator, emitted } = makeEnumerator({
      getDialogsResult: [
        { entity: 'Channel', id: '202', title: 'No-rights Supergroup', megagroup: true },
      ],
    })
    await enumerator.enumerateAtLogin()
    const loaded = emitted.find((s) => s.step === 'loaded')
    if (loaded?.step === 'loaded') {
      expect(loaded.dialogs[0].canAct).toBe(false)
      expect(loaded.dialogs[0].greyReason).toBe('no-ban-right')
    }
  })
})

// ---------------------------------------------------------------------------
// GRP-05 — type detection: broadcast channel
// ---------------------------------------------------------------------------

describe('type detection — broadcast channel', () => {
  it('classifies non-megagroup Channel as broadcast-channel', async () => {
    const { enumerator, emitted } = makeEnumerator({
      getDialogsResult: [
        { entity: 'Channel', id: '300', title: 'Broadcast Channel', megagroup: false },
      ],
    })
    await enumerator.enumerateAtLogin()
    const loaded = emitted.find((s) => s.step === 'loaded')
    if (loaded?.step === 'loaded') {
      expect(loaded.dialogs[0].type).toBe('broadcast-channel')
    }
  })

  it('canAct=false always', async () => {
    const { enumerator, emitted } = makeEnumerator({
      getDialogsResult: [
        {
          entity: 'Channel',
          id: '301',
          title: 'Admin Broadcast Channel',
          megagroup: false,
          adminRights: { banUsers: true },
        },
      ],
    })
    await enumerator.enumerateAtLogin()
    const loaded = emitted.find((s) => s.step === 'loaded')
    if (loaded?.step === 'loaded') {
      expect(loaded.dialogs[0].canAct).toBe(false)
      expect(loaded.dialogs[0].greyReason).toBe('broadcast-channel')
    }
  })
})

// ---------------------------------------------------------------------------
// GRP-05, GRP-04 — enumerateAtLogin: success path
// ---------------------------------------------------------------------------

describe('enumerateAtLogin — success', () => {
  it('emits loading then loaded states', async () => {
    const { enumerator, emitted } = makeEnumerator({
      getDialogsResult: [{ entity: 'Chat', id: '400', title: 'A Group', creator: true }],
    })
    await enumerator.enumerateAtLogin()
    expect(emitted[0].step).toBe('loading')
    expect(emitted[1].step).toBe('loaded')
  })

  it('loaded state contains AdminDialogDTO[] with id, title, type, canAct, greyReason', async () => {
    const { enumerator, emitted } = makeEnumerator({
      getDialogsResult: [
        { entity: 'Chat', id: '401', title: 'Test Group', creator: true },
        { entity: 'Channel', id: '402', title: 'Test Supergroup', megagroup: true, adminRights: { banUsers: true } },
      ],
    })
    await enumerator.enumerateAtLogin()
    const loaded = emitted.find((s) => s.step === 'loaded')
    expect(loaded?.step).toBe('loaded')
    if (loaded?.step === 'loaded') {
      expect(loaded.dialogs).toHaveLength(2)
      const [chat, sg] = loaded.dialogs
      expect(chat.id).toBe('401')
      expect(chat.title).toBe('Test Group')
      expect(chat.type).toBe('basic-group')
      expect(chat.canAct).toBe(true)
      expect(chat.greyReason).toBeNull()
      expect(sg.id).toBe('402')
      expect(sg.title).toBe('Test Supergroup')
      expect(sg.type).toBe('supergroup')
      expect(sg.canAct).toBe(true)
      expect(sg.greyReason).toBeNull()
    }
  })
})

// ---------------------------------------------------------------------------
// GRP-05, GRP-04 — enumerateAtLogin: error path
// ---------------------------------------------------------------------------

describe('enumerateAtLogin — error', () => {
  it('emits error state on getDialogs failure', async () => {
    const { enumerator, emitted } = makeEnumerator({
      getDialogsError: 'FLOOD_WAIT_30' as any,
    })
    await enumerator.enumerateAtLogin()
    const errorState = emitted.find((s) => s.step === 'error')
    expect(errorState?.step).toBe('error')
  })
})

// ---------------------------------------------------------------------------
// getState() and refresh()
// ---------------------------------------------------------------------------

describe('getState() and refresh()', () => {
  it('getState() returns current state after enumerateAtLogin', async () => {
    const { enumerator } = makeEnumerator({
      getDialogsResult: [{ entity: 'Chat', id: '500', title: 'Group', creator: true }],
    })
    expect(enumerator.getState().step).toBe('idle')
    await enumerator.enumerateAtLogin()
    expect(enumerator.getState().step).toBe('loaded')
  })

  it('refresh() re-runs enumerateAtLogin (second loaded emission)', async () => {
    const { enumerator, emitted } = makeEnumerator({
      getDialogsResult: [{ entity: 'Chat', id: '501', title: 'Group', creator: true }],
    })
    await enumerator.enumerateAtLogin()
    await enumerator.refresh()
    const loadedStates = emitted.filter((s) => s.step === 'loaded')
    expect(loadedStates.length).toBeGreaterThanOrEqual(2)
  })
})

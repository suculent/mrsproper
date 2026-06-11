/**
 * RED test stubs for GroupEnumerator.ts (GRP-04, GRP-05).
 * These tests will remain todo/pending until Plan 04-02 creates GroupEnumerator.ts.
 *
 * Test map:
 *   - GRP-04: type detection and rights detection (canAct logic)
 *   - GRP-05: dialog entity classification (Chat, Channel megagroup, Channel broadcast)
 */

import { describe, it } from 'vitest'

// ---------------------------------------------------------------------------
// GRP-05, GRP-04 — type detection: Api.Chat (basic group)
// ---------------------------------------------------------------------------

describe('type detection — Api.Chat entity', () => {
  it.todo('classifies Chat as basic-group')
  it.todo('canAct=true when entity.creator=true')
  it.todo('canAct=true when entity.adminRights.banUsers=true (OQ-2 OR logic)')
  it.todo('canAct=false when neither creator nor banUsers')
})

// ---------------------------------------------------------------------------
// GRP-05, GRP-04 — type detection: Api.Channel megagroup (supergroup)
// ---------------------------------------------------------------------------

describe('type detection — Api.Channel megagroup', () => {
  it.todo('classifies megagroup Channel as supergroup')
  it.todo('canAct=true when adminRights.banUsers=true')
  it.todo('canAct=false when adminRights.banUsers absent')
})

// ---------------------------------------------------------------------------
// GRP-05 — type detection: broadcast channel
// ---------------------------------------------------------------------------

describe('type detection — broadcast channel', () => {
  it.todo('classifies non-megagroup Channel as broadcast-channel')
  it.todo('canAct=false always')
})

// ---------------------------------------------------------------------------
// GRP-05, GRP-04 — enumerateAtLogin: success path
// ---------------------------------------------------------------------------

describe('enumerateAtLogin — success', () => {
  it.todo('emits loading then loaded states')
  it.todo('loaded state contains AdminDialogDTO[] with id, title, type, canAct, greyReason')
})

// ---------------------------------------------------------------------------
// GRP-05, GRP-04 — enumerateAtLogin: error path
// ---------------------------------------------------------------------------

describe('enumerateAtLogin — error', () => {
  it.todo('emits error state on getDialogs failure')
})

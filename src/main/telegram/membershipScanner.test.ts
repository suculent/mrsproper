/**
 * RED test stubs for MembershipScanner.ts (GRP-01).
 * These tests will remain todo/pending until Plan 04-03 creates MembershipScanner.ts.
 *
 * Test map:
 *   - GRP-01: membership verification for supergroups/channels via GetParticipant
 *   - GRP-01: membership verification for basic groups via GetFullChat participant list
 *   - GRP-01: streaming progress emission during scan
 *   - GRP-01: per-group failure isolation (does not abort rest of scan)
 *   - WR-03: abort/generation token invalidation
 *   - GRP-01: retryGroup single-group re-check
 */

import { describe, it } from 'vitest'

// ---------------------------------------------------------------------------
// GRP-01 — supergroup/channel membership via channels.GetParticipant
// ---------------------------------------------------------------------------

describe('scan — supergroup/channel membership', () => {
  it.todo('isMember=true when GetParticipant returns ChannelParticipant')
  it.todo('isMember=false when GetParticipant throws USER_NOT_PARTICIPANT')
  it.todo('isMember=false when GetParticipant returns ChannelParticipantLeft')
  it.todo('isMember=false when GetParticipant returns ChannelParticipantBanned')
})

// ---------------------------------------------------------------------------
// GRP-01 — basic group membership via messages.GetFullChat participant list
// ---------------------------------------------------------------------------

describe('scan — basic group membership', () => {
  it.todo('isMember=true when userId in GetFullChat participants')
  it.todo('isMember=false when userId not in GetFullChat participants')
})

// ---------------------------------------------------------------------------
// GRP-01 — streaming progress emission
// ---------------------------------------------------------------------------

describe('scan — progress emission', () => {
  it.todo('emits scanning state with progress { checked, total } per group')
  it.todo('emits complete when all groups checked')
})

// ---------------------------------------------------------------------------
// GRP-01 — per-group failure isolation
// ---------------------------------------------------------------------------

describe('scan — failure isolation', () => {
  it.todo('per-group error sets status=failed, does not abort rest of scan')
})

// ---------------------------------------------------------------------------
// WR-03 — abort/generation token
// ---------------------------------------------------------------------------

describe('abortScan', () => {
  it.todo('calling abortScan increments generation and emits idle')
})

// ---------------------------------------------------------------------------
// GRP-01 — retryGroup single-group re-check
// ---------------------------------------------------------------------------

describe('retryGroup', () => {
  it.todo('re-checks a single failed group and emits updated results')
})

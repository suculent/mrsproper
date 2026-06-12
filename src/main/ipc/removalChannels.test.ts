/**
 * Wave 0 RED stubs for removalChannels.ts (IPC channel security + Zod validation).
 *
 * All tests are it.todo() — Nyquist compliance gate before implementation.
 * Vitest treats todo stubs as pending (not failing) and exits 0.
 *
 * Test map:
 *   - removal:start Zod validation: rejects missing severity, invalid severity value, empty dialogIds
 *   - removal:retryGroup Zod validation: rejects missing dialogId
 *   - Security gate: removal:start requires authState.step === 'authorized'
 *   - Security gate: removal:retryGroup validates dialogId is in current job dialogIds
 */

import { describe, it } from 'vitest'

// ---------------------------------------------------------------------------
// removalChannels — Zod validation
// ---------------------------------------------------------------------------

describe('removalChannels — Zod validation', () => {
  it.todo('removal:start rejects payload missing severity field')
  it.todo('removal:start rejects severity value not in kick|ban')
  it.todo('removal:start rejects dialogIds with length 0')
  it.todo('removal:retryGroup rejects payload missing dialogId')
})

// ---------------------------------------------------------------------------
// removalChannels — security gates
// ---------------------------------------------------------------------------

describe('removalChannels — security gates', () => {
  it.todo('removal:start requires authState.step === authorized; returns error state when not authorized')
  it.todo('removal:retryGroup validates dialogId is in current job dialogIds; rejects unknown dialogId')
})

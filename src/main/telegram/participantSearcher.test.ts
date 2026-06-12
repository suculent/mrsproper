/**
 * Wave 0 Nyquist stubs for ParticipantSearcher (TGT-05a through TGT-05f, TGT-05k).
 *
 * These it.todo() stubs satisfy the Nyquist requirement so that `npx vitest run`
 * exits 0 before the implementation lands. GREEN tests will replace these stubs
 * in the next plan (04.1-02).
 *
 * Test map:
 *   - TGT-05a: streams candidates for supergroup via GetParticipants+ChannelParticipantsSearch
 *   - TGT-05b: applies client-side filter for basic groups
 *   - TGT-05c: deduplicates by userId and merges foundIn across groups
 *   - TGT-05d: generation guard: new search() invalidates prior in-flight search
 *   - TGT-05e: abortSearch() emits idle and clears candidateAccessHashes
 *   - TGT-05f: per-group failure isolation: one group error does not abort remaining groups
 *   - TGT-05k: ChannelParticipantsNotModified handled gracefully — no crash
 */

import { describe, it } from 'vitest'

describe('ParticipantSearcher', () => {
  it.todo('streams candidates for supergroup via GetParticipants+ChannelParticipantsSearch')
  it.todo('applies client-side filter for basic groups')
  it.todo('deduplicates by userId and merges foundIn across groups')
  it.todo('generation guard: new search() invalidates prior in-flight search')
  it.todo('abortSearch() emits idle and clears candidateAccessHashes')
  it.todo('per-group failure isolation: one group error does not abort remaining groups')
  it.todo('ChannelParticipantsNotModified handled gracefully — no crash')
})

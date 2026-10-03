/**
 * tlLayer.test.ts — real-package TL layer regression guard (TL229)
 *
 * This test exists to catch `node_modules/telegram` drifting back to layer 198
 * (e.g. `npm install` run without the `postinstall` hook firing, or a future
 * `telegram` version bump resetting `tl/static/`). It imports the REAL
 * `telegram` package directly — not through any mock — so it only passes when
 * `scripts/tl-apply.mjs` has successfully patched the installed package to
 * layer 229 with the vendored layer-229 schema.
 *
 * No other test file in this directory globally intercepts bare `telegram`
 * imports: `src/main/telegram/__mocks__/telegramClient.ts` is a hand-built
 * class injected via constructor options elsewhere (not a Vitest module mock
 * for the `telegram` package itself), and `tagClient.test.ts` no longer mocks
 * `telegram/tl/AllTLObjects` at all (that mock was deleted along with the
 * patch-connect-restore mechanism it was guarding). So these imports resolve
 * to the real, `tl-apply.mjs`-patched package.
 */

import { describe, it, expect } from 'vitest'
import { Api } from 'telegram'
import { LAYER } from 'telegram/tl/AllTLObjects'

describe('telegram package TL layer', () => {
  it('reports LAYER === 229', () => {
    expect(LAYER).toBe(229)
  })

  it('Api.ChannelParticipant resolves to the layer-229 constructor ID', () => {
    expect(Api.ChannelParticipant.CONSTRUCTOR_ID).toBe(0x1bd54456)
  })

  it('Api.ChannelParticipantSelf resolves to the layer-229 constructor ID', () => {
    expect(Api.ChannelParticipantSelf.CONSTRUCTOR_ID).toBe(0xa9478a1a)
  })

  it('Api.ChannelParticipantBanned resolves to the layer-229 constructor ID', () => {
    expect(Api.ChannelParticipantBanned.CONSTRUCTOR_ID).toBe(0xd5f0ad91)
  })

  it('Api.messages.EditChatParticipantRank resolves to the layer-229 constructor ID', () => {
    expect(Api.messages.EditChatParticipantRank.CONSTRUCTOR_ID).toBe(0xa00f32b0)
  })

  it('Api.channels.InviteToChannel and Api.messages.InvitedUsers are both defined', () => {
    expect(Api.channels.InviteToChannel).toBeDefined()
    expect(Api.messages.InvitedUsers).toBeDefined()
  })
})

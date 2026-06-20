/**
 * Unit tests for tagApi.ts — vendored editChatParticipantRank request factory
 * and TL-string encoder.
 *
 * Test map:
 *   1. Golden-byte assertion: fixture channel/user/rank → exact hex bytes
 *   2. Empty rank: serializeTLString('') → 4 bytes (1 zero + 3 padding)
 *   3. Short string alignment: 'x' → 4 bytes [0x01, 0x78, 0x00, 0x00]
 *   4. 4-byte aligned string: 'abc' → 8 bytes [0x03, 0x61, 0x62, 0x63, 0x00, 0x00, 0x00, 0x00]
 *   5. Extended-header path: 254-char string → 4-byte header (0xfe prefix)
 *   6. Object shape: CONSTRUCTOR_ID, SUBCLASS_OF_ID, classType, className
 *   7. readResult: delegates to reader.tgReadObject()
 */

import { describe, it, expect } from 'vitest'
import bigInt from 'big-integer'
import { Api } from 'telegram'
import { makeEditChatParticipantRankRequest, serializeTLString } from './tagApi'

describe('serializeTLString', () => {
  it('empty rank serializes to 4 bytes (1 zero + 3 padding)', () => {
    const buf = serializeTLString('')
    expect(buf.length).toBe(4)
    expect(buf[0]).toBe(0)
  })

  it('single-char "x" serializes to 4 bytes [0x01, 0x78, 0x00, 0x00]', () => {
    const buf = serializeTLString('x')
    expect(Array.from(buf)).toEqual([0x01, 0x78, 0x00, 0x00])
  })

  it('"abc" (3 bytes) serializes to 8 bytes with correct padding', () => {
    const buf = serializeTLString('abc')
    expect(Array.from(buf)).toEqual([0x03, 0x61, 0x62, 0x63, 0x00, 0x00, 0x00, 0x00])
  })

  it('254-char string uses 4-byte extended header (0xfe prefix)', () => {
    const str = 'A'.repeat(254)
    const buf = serializeTLString(str)
    // Extended header: [0xfe, 254, 0, 0]
    expect(buf[0]).toBe(0xfe)
    expect(buf[1]).toBe(254)
    expect(buf[2]).toBe(0)
    expect(buf[3]).toBe(0)
    // Total length: 4 (header) + 254 (data) + padding to multiple of 4
    const dataAndHeader = 4 + 254
    const padding = (4 - (dataAndHeader % 4)) % 4
    expect(buf.length).toBe(dataAndHeader + padding)
    // Total must be a multiple of 4
    expect(buf.length % 4).toBe(0)
  })
})

describe('makeEditChatParticipantRankRequest', () => {
  it('golden-byte assertion: exact hex matches Phase 0 spike fixture', () => {
    const peer = new Api.InputPeerChannel({
      channelId: bigInt('3906767609'),
      accessHash: bigInt('6143171097270719809'),
    })
    const participant = new Api.InputPeerUser({
      userId: bigInt('8471834904'),
      accessHash: bigInt('-7811701663729573470'),
    })

    const req = makeEditChatParticipantRankRequest(peer, participant, 'testtag')
    const hex = Buffer.from(req.getBytes()).toString('hex')

    expect(hex).toBe(
      'b0320fa0fcbbbc27f98adce800000000419544a790ed40554ca5e8dd18f1f5f801000000a221129ab94297930774657374746167'
    )
  })

  it('object shape: CONSTRUCTOR_ID, SUBCLASS_OF_ID, classType, className', () => {
    const peer = new Api.InputPeerChannel({
      channelId: bigInt('1'),
      accessHash: bigInt('0'),
    })
    const participant = new Api.InputPeerUser({
      userId: bigInt('1'),
      accessHash: bigInt('0'),
    })

    const req = makeEditChatParticipantRankRequest(peer, participant, '')

    expect(req.CONSTRUCTOR_ID).toBe(0xa00f32b0 >>> 0)
    expect(req.SUBCLASS_OF_ID).toBe(2331323052)
    expect(req.classType).toBe('request')
    expect(req.className).toBe('messages.EditChatParticipantRank')
  })

  it('readResult delegates to reader.tgReadObject()', () => {
    const peer = new Api.InputPeerChannel({
      channelId: bigInt('1'),
      accessHash: bigInt('0'),
    })
    const participant = new Api.InputPeerUser({
      userId: bigInt('1'),
      accessHash: bigInt('0'),
    })

    const req = makeEditChatParticipantRankRequest(peer, participant, '')
    const stubReader = { tgReadObject: () => ({ mocked: true }) }

    expect(req.readResult(stubReader)).toEqual({ mocked: true })
  })
})

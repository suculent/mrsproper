/**
 * tagApi.ts — vendored TL request for messages.editChatParticipantRank#a00f32b0
 *
 * GramJS 2.26.22 (layer 198) does not ship this method. This module serializes
 * the request by hand, matching the exact bytes proven by the Phase 0 empirical
 * spike (scripts/spike-member-tag.mjs).
 *
 * TL schema:
 *   messages.editChatParticipantRank#a00f32b0
 *     peer:InputPeer participant:InputPeer rank:string = Updates
 *
 * This module is PURE: request factory + TL-string encoder only.
 * No client/connection logic. No AllTLObjects mutation. No side effects.
 *
 * Callers (Phase 10 TagExecutor) import makeEditChatParticipantRankRequest and
 * pass the result to tagClient.invoke().
 */

import { Api } from 'telegram'

// ── Module constants ──────────────────────────────────────────────────────────

/** Constructor ID for messages.editChatParticipantRank (unsigned 32-bit). */
const EDIT_CHAT_PARTICIPANT_RANK_ID = 0xa00f32b0 >>> 0

/** SUBCLASS_OF_ID shared by all Updates-returning methods. */
const UPDATES_SUBCLASS_OF_ID = 2331323052

// ── Interface ─────────────────────────────────────────────────────────────────

export interface EditChatParticipantRankRequest {
  className: string
  classType: 'request'
  CONSTRUCTOR_ID: number
  SUBCLASS_OF_ID: number
  resolve(): Promise<EditChatParticipantRankRequest>
  getBytes(): Buffer
  readResult(reader: { tgReadObject(): unknown }): unknown
}

// ── TL-string encoder ─────────────────────────────────────────────────────────

/**
 * Encode a string as a TL byte-string (MTProto serialization).
 *
 * Short strings (len <= 253): 1-byte length header.
 * Long strings (len >= 254): 4-byte extended header [0xfe, len&0xff, len>>8&0xff, len>>16&0xff].
 * Both forms pad to the next 4-byte boundary with zero bytes.
 */
export function serializeTLString(str: string): Buffer {
  const data = Buffer.from(str, 'utf8')
  const len = data.length

  const header =
    len <= 253
      ? Buffer.from([len])
      : Buffer.from([0xfe, len & 0xff, (len >> 8) & 0xff, (len >> 16) & 0xff])

  const pad = (4 - ((header.length + data.length) % 4)) % 4
  return Buffer.concat([header, data, Buffer.alloc(pad)])
}

// ── Request factory ───────────────────────────────────────────────────────────

/**
 * Build a GramJS-compatible request object for messages.editChatParticipantRank.
 *
 * The returned object can be passed directly to client.invoke().
 * getBytes() produces the exact wire bytes: constructor id (LE) + peer bytes +
 * participant bytes + TL-encoded rank string.
 *
 * @param peer        InputPeerChannel for the target group.
 * @param participant InputPeerUser for the member being tagged.
 * @param rank        The member tag string (empty string clears the tag).
 */
export function makeEditChatParticipantRankRequest(
  peer: Api.InputPeerChannel,
  participant: Api.InputPeerUser,
  rank: string
): EditChatParticipantRankRequest {
  const idLE = Buffer.alloc(4)
  idLE.writeUInt32LE(EDIT_CHAT_PARTICIPANT_RANK_ID, 0)

  return {
    className: 'messages.EditChatParticipantRank',
    classType: 'request',
    CONSTRUCTOR_ID: EDIT_CHAT_PARTICIPANT_RANK_ID,
    SUBCLASS_OF_ID: UPDATES_SUBCLASS_OF_ID,

    resolve(): Promise<EditChatParticipantRankRequest> {
      return Promise.resolve(this)
    },

    getBytes(): Buffer {
      return Buffer.concat([
        idLE,
        Buffer.from(peer.getBytes()),
        Buffer.from(participant.getBytes()),
        serializeTLString(rank),
      ])
    },

    readResult(reader: { tgReadObject(): unknown }): unknown {
      return reader.tgReadObject()
    },
  }
}

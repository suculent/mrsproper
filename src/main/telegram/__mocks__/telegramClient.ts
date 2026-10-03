/**
 * Configurable mock GramJS TelegramClient for unit tests.
 *
 * Open Question A2 resolved (telegram@2.26.22 .d.ts):
 *   signInWithPassword(client, apiCredentials, authParams: UserPasswordAuthParams)
 *   UserPasswordAuthParams = { password?: (hint?: string) => Promise<string>; onError: (err: Error) => Promise<boolean> | void }
 *   The `password` field is a CALLBACK form: (hint?: string) => Promise<string>
 *   NOT a plain value. The mock is shaped to accept this callback form.
 *
 * RPCError shapes (sourced from installed telegram@2.26.22 + RESEARCH Pitfall 4):
 *   - err.errorMessage === 'SESSION_PASSWORD_NEEDED' (exact string — Pitfall 4)
 *   - err.errorMessage === 'PHONE_CODE_INVALID'
 *   - err.errorMessage === 'PHONE_CODE_EXPIRED'
 *   - err.errorMessage === 'PASSWORD_HASH_INVALID'
 *   - err.errorMessage === 'AUTH_KEY_UNREGISTERED'
 *   - err.errorMessage === 'FLOOD_WAIT_<n>' AND err.seconds === n (FloodWaitError shape)
 *
 * Long/ID shape (CR-02 — verified against installed telegram@2.26.22):
 *   GramJS `long` fields (peer.userId, user.id, user.accessHash) are `big-integer`
 *   library objects (typeof === 'object'), NOT native bigint. The mock returns
 *   bigInt(...) instances so tests exercise the exact production shape — code that
 *   does `typeof x === 'bigint'` or compares IDs with `===` MUST fail here too.
 */

import bigInt from 'big-integer'
import { Api } from 'telegram'

export type MockRPCErrorCode =
  | 'SESSION_PASSWORD_NEEDED'
  | 'PHONE_CODE_INVALID'
  | 'PHONE_CODE_EXPIRED'
  | 'PASSWORD_HASH_INVALID'
  | 'AUTH_KEY_UNREGISTERED'
  | 'SESSION_REVOKED'
  // Phase 3: target resolution error codes (TGT-04)
  | 'USERNAME_NOT_OCCUPIED'
  | 'PHONE_NOT_OCCUPIED'
  | { type: 'FLOOD_WAIT'; seconds: number }

/** Create an RPC-shaped error that matches GramJS RPCError + FloodWaitError shapes. */
function makeRPCError(code: MockRPCErrorCode): Error & { errorMessage: string; seconds?: number } {
  if (typeof code === 'object' && code.type === 'FLOOD_WAIT') {
    const err = new Error(`FLOOD_WAIT_${code.seconds}`) as Error & {
      errorMessage: string
      seconds: number
    }
    err.errorMessage = `FLOOD_WAIT_${code.seconds}`
    err.seconds = code.seconds
    return err
  }
  const codeStr = code as string
  const err = new Error(codeStr) as Error & { errorMessage: string }
  err.errorMessage = codeStr
  return err
}

export interface MockClientConfig {
  /** If set, sendCode will throw this error code. */
  sendCodeError?: MockRPCErrorCode
  /** If set, invoke (SignIn) will throw this error code. */
  signInError?: MockRPCErrorCode
  /** If set, signInWithPassword will throw this error code. */
  signInWithPasswordError?: MockRPCErrorCode
  /** If set, checkAuthorization resolves to this value (default: false). */
  isAuthorized?: boolean
  /** If set, connect will throw this error code. */
  connectError?: MockRPCErrorCode
  /**
   * If set, connect will throw a PLAIN Error (no errorMessage field) with this
   * message — simulates an offline launch / network failure (not an RPC error).
   */
  connectPlainError?: string
  /** Simulated identity to return from getMe / downloadProfilePhoto. */
  identity?: {
    firstName: string
    lastName?: string
    username?: string
    id: string
    hasPhoto: boolean
  }
  /** Simulated session string (for session.save()). */
  sessionString?: string
  /** If set, invoke (LogOut) will throw an RPC-shaped error with this code. */
  logoutErrorCode?: MockRPCErrorCode

  // ── Phase 3: target resolution mock controls ─────────────────────────────
  /** If set, invoke (ResolveUsername) will throw this error. */
  resolveUsernameError?: MockRPCErrorCode
  /**
   * If true, invoke (ResolveUsername) resolves to a CHANNEL peer (no userId) —
   * simulates a public channel/group username (CR-03: no public user profile).
   */
  resolveUsernameChannelPeer?: boolean
  /** If set, invoke (ResolveUsername) returns this resolved peer data. */
  resolveUsernameResult?: {
    userId: string
    username: string
    firstName: string
    accessHash: string
  }
  /** If set, invoke (ResolvePhone) will throw this error. */
  resolvePhoneError?: MockRPCErrorCode
  /** If set, invoke (ResolvePhone) returns this resolved peer data. */
  resolvePhoneResult?: {
    userId: string
    firstName: string
    username?: string
    accessHash: string
  }
  /** If set, invoke (GetFullUser) returns this data. */
  getFullUserResult?: { about: string | null }
  /** If set, invoke (GetFullUser) will throw this error. */
  getFullUserError?: MockRPCErrorCode
  /**
   * If set, downloadProfilePhoto throws an RPC-shaped error with this
   * errorMessage — simulates an expired file reference / photo-download RPC
   * failure (WR-02). RPC-shaped (not a plain Error) so the governor classifies
   * it as 'fail' and throws immediately instead of running NETWORK backoff.
   */
  downloadProfilePhotoError?: string

  // ── Phase 4: group enumeration + membership mock controls ──────────────
  /** If set, getDialogs returns these dialog-like objects. */
  getDialogsResult?: Array<{
    entity: 'Chat' | 'Channel' | 'ChannelBroadcast'
    id: string
    title: string
    megagroup?: boolean
    creator?: boolean
    adminRights?: { banUsers?: boolean; inviteUsers?: boolean }
    /** Forbidden-rights mask for members without explicit adminRights (D-04/D-06). */
    defaultBannedRights?: { inviteUsers?: boolean }
    /** Member count — used for the broadcast-channel 200-member channel-full override (D-06). */
    participantsCount?: number
    /** Basic-group husk flags (migrated-to-supergroup duplicates). */
    migratedTo?: unknown
    deactivated?: boolean
  }>
  /** If set, GetParticipant throws USER_NOT_PARTICIPANT for these dialogIds. */
  notMemberDialogIds?: string[]
  /** If set, GetFullChat returns participant list for these chatIds. */
  basicGroupParticipants?: Record<string, string[]>  // chatId → userId[]
  /** If set, getDialogs throws this error. */
  getDialogsError?: MockRPCErrorCode

  // ── Phase 4.1: name search mock controls ─────────────────────────────────
  /** If set, channels.GetParticipants returns these users for the given channelId. */
  getParticipantsResult?: Record<string, Array<{
    userId: string
    firstName?: string
    lastName?: string
    username?: string
    accessHash?: string
  }>>
  /** If set, channels.GetParticipants throws this error for these channelIds. */
  getParticipantsError?: Record<string, MockRPCErrorCode>
  /** If set, users.GetUsers returns this user for the given userId. */
  getUsersResult?: Record<string, { firstName?: string; lastName?: string; username?: string; accessHash?: string }>

  // ── Phase 5: removal mock controls ───────────────────────────────────────
  /**
   * If set, EditBanned/DeleteChatUser returns {} (success) for matching channelId/chatId.
   * If undefined, all removal calls succeed by default (empty array = explicit list of successes,
   * undefined = all succeed; the default catch-all returns {} anyway).
   */
  removeSuccessDialogIds?: string[]
  /**
   * If set, EditBanned/DeleteChatUser throws USER_NOT_PARTICIPANT for matching channelId/chatId.
   * Used to test 'already-gone' outcome classification.
   */
  removeAlreadyGoneDialogIds?: string[]
  /**
   * Maps dialogId → errorMessage string. EditBanned/DeleteChatUser throws with the mapped
   * errorMessage for the matching channelId/chatId.
   */
  removeErrorDialogIds?: Record<string, string>

  // ── Phase 5: call-recording arrays (reset in factory, pushed on each invoke) ─
  /**
   * Records each EditBanned call for sequence assertions.
   * ban = 1 call (viewMessages=true, untilDate=0)
   * kick = 2 calls (restrict + unban, 500ms sleep between)
   * Initialized to [] by the factory — do not pass in config; read after execute().
   */
  editBannedCalls?: Array<{ channelId: string; viewMessages: boolean; untilDate: number }>
  /**
   * Records each DeleteChatUser call.
   * Initialized to [] by the factory — do not pass in config; read after execute().
   */
  deleteChatUserCalls?: Array<{ chatId: string }>
}

const DEFAULT_IDENTITY = {
  firstName: 'Test',
  lastName: 'User',
  username: 'testuser',
  id: '123456789',
  hasPhoto: false,
}

/**
 * Create a configurable mock TelegramClient.
 * Exposes the same surface as the real client that our auth/session code calls.
 */
export function createMockTelegramClient(config: MockClientConfig = {}) {
  // Phase 5: initialize call-recording arrays on the config object (always reset per factory call)
  config.editBannedCalls = []
  config.deleteChatUserCalls = []
  // Expose on the returned client for test assertions (read after execute)
  const _editBannedCalls = config.editBannedCalls
  const _deleteChatUserCalls = config.deleteChatUserCalls

  const sessionStr = config.sessionString ?? 'mock-session-string'

  const client = {
    // ── Connection ──────────────────────────────────────────────────────────
    connect: async () => {
      if (config.connectPlainError) {
        throw new Error(config.connectPlainError)
      }
      if (config.connectError) {
        throw makeRPCError(config.connectError)
      }
    },

    disconnect: async () => {
      // no-op in tests
    },

    checkAuthorization: async (): Promise<boolean> => {
      return config.isAuthorized ?? false
    },

    // ── Session ──────────────────────────────────────────────────────────────
    session: {
      save: (): string => sessionStr,
    },

    // ── Auth: sendCode ────────────────────────────────────────────────────────
    sendCode: async (
      _apiCreds: { apiId: number; apiHash: string },
      _phoneNumber: string
    ): Promise<{ phoneCodeHash: string; isCodeViaApp: boolean }> => {
      if (config.sendCodeError) {
        throw makeRPCError(config.sendCodeError)
      }
      return { phoneCodeHash: 'mock-phone-code-hash', isCodeViaApp: true }
    },

    // ── Auth: invoke (used for Api.auth.SignIn and Api.auth.LogOut) ───────────
    invoke: async (request: unknown): Promise<unknown> => {
      // Detect by constructor name to avoid importing GramJS directly in tests
      const ctorName = (request as { constructor?: { name?: string } })?.constructor?.name ?? ''

      if (ctorName === 'SignIn' || (request as { className?: string })?.className === 'auth.SignIn') {
        if (config.signInError) {
          throw makeRPCError(config.signInError)
        }
        return { _: 'auth.authorization', user: { _: 'user', id: config.identity?.id ?? DEFAULT_IDENTITY.id } }
      }

      if (ctorName === 'LogOut' || (request as { className?: string })?.className === 'auth.LogOut') {
        if (config.logoutErrorCode) {
          throw makeRPCError(config.logoutErrorCode)
        }
        return { futureAuthToken: null }
      }

      // ── Phase 3: target resolution invoke dispatch ───────────────────────
      // contacts.ResolveUsername — username → peer (TGT-01)
      if (ctorName === 'ResolveUsername' || (request as { className?: string })?.className === 'contacts.ResolveUsername') {
        if (config.resolveUsernameError) {
          throw makeRPCError(config.resolveUsernameError)
        }
        if (config.resolveUsernameChannelPeer) {
          // Channel/group peer — PeerChannel has channelId, NOT userId (CR-03).
          return {
            peer: { channelId: bigInt('987654321') },
            users: [],
            chats: [{ id: bigInt('987654321'), title: 'Mock Channel' }],
          }
        }
        const r = config.resolveUsernameResult ?? {
          userId: '111111111',
          username: 'mockuser',
          firstName: 'Mock',
          accessHash: 'mock-access-hash',
        }
        return {
          // CR-02: big-integer instances — the real GramJS deserializer shape.
          peer: { userId: bigInt(r.userId) },
          users: [
            {
              id: bigInt(r.userId),
              accessHash: bigInt(r.accessHash.replace(/[^0-9-]/g, '0').slice(0, 15) || '0'),
              firstName: r.firstName,
              lastName: undefined,
              username: r.username,
              deleted: false,
              bot: false,
              premium: false,
              status: undefined,
            },
          ],
          chats: [],
        }
      }

      // contacts.ResolvePhone — phone → peer (TGT-02, D-07 REVISED)
      if (ctorName === 'ResolvePhone' || (request as { className?: string })?.className === 'contacts.ResolvePhone') {
        if (config.resolvePhoneError) {
          throw makeRPCError(config.resolvePhoneError)
        }
        const r = config.resolvePhoneResult ?? {
          userId: '222222222',
          firstName: 'MockPhone',
          username: undefined,
          accessHash: '0',
        }
        return {
          // CR-02: big-integer instances — the real GramJS deserializer shape.
          peer: { userId: bigInt(r.userId) },
          users: [
            {
              id: bigInt(r.userId),
              accessHash: bigInt.zero,
              firstName: r.firstName,
              lastName: undefined,
              username: r.username ?? null,
              deleted: false,
              bot: false,
              premium: false,
              status: undefined,
            },
          ],
          chats: [],
        }
      }

      // users.GetFullUser — fetch bio (VRF-02)
      if (ctorName === 'GetFullUser' || (request as { className?: string })?.className === 'users.GetFullUser') {
        if (config.getFullUserError) {
          throw makeRPCError(config.getFullUserError)
        }
        return {
          fullUser: { about: config.getFullUserResult?.about ?? null },
          users: [],
          chats: [],
        }
      }

      // channels.GetParticipant — membership check (GRP-01)
      if (ctorName === 'GetParticipant' || (request as { className?: string })?.className === 'channels.GetParticipant') {
        const channelInput = (request as { channel?: { channelId?: { toString(): string } } }).channel
        const channelId = channelInput?.channelId?.toString() ?? ''
        if (config.notMemberDialogIds?.includes(channelId)) {
          const err = Object.assign(new Error('USER_NOT_PARTICIPANT'), { errorMessage: 'USER_NOT_PARTICIPANT' })
          throw err
        }
        // Return a ChannelParticipant (member)
        return { participant: { className: 'ChannelParticipant', userId: bigInt('12345') } }
      }

      // channels.GetParticipants — name search (Phase 4.1)
      if (ctorName === 'GetParticipants' || (request as { className?: string })?.className === 'channels.GetParticipants') {
        const channelId = (request as { channel?: { channelId?: { toString(): string } } }).channel?.channelId?.toString() ?? ''
        if (config.getParticipantsError?.[channelId]) {
          throw makeRPCError(config.getParticipantsError[channelId]!)
        }
        const users = (config.getParticipantsResult?.[channelId] ?? []).map(u => ({
          id: bigInt(u.userId),
          accessHash: bigInt(u.accessHash ?? '0'),
          firstName: u.firstName,
          lastName: u.lastName,
          username: u.username ?? null,
          deleted: false,
          min: false,
        }))
        return {
          className: 'channels.ChannelParticipants',
          count: users.length,
          participants: users.map(u => ({ className: 'ChannelParticipant', userId: u.id })),
          users,
          chats: [],
        }
      }

      // users.GetUsers — candidate resolution (Phase 4.1)
      if (ctorName === 'GetUsers' || (request as { className?: string })?.className === 'users.GetUsers') {
        const ids = (request as { id?: Array<{ userId?: { toString(): string } }> }).id ?? []
        const userId = ids[0]?.userId?.toString() ?? ''
        const u = config.getUsersResult?.[userId] ?? { firstName: 'Unknown' }
        return [{
          id: bigInt(userId),
          accessHash: bigInt(u.accessHash ?? '0'),
          firstName: u.firstName,
          lastName: u.lastName,
          username: u.username ?? null,
          deleted: false,
          bot: false,
          premium: false,
          status: undefined,
        }]
      }

      // ── Phase 5: channels.EditBanned — supergroup/channel ban/kick (RMV-01, RMV-02) ─
      if (ctorName === 'EditBanned' || (request as { className?: string })?.className === 'channels.EditBanned') {
        const channelId = (request as { channel?: { channelId?: { toString(): string } } })
          .channel?.channelId?.toString() ?? ''
        const bannedRights = (request as { bannedRights?: { viewMessages?: boolean; untilDate?: number } }).bannedRights
        const viewMessages = bannedRights?.viewMessages ?? false
        const untilDate = bannedRights?.untilDate ?? 0
        // Record the call for sequence assertions
        _editBannedCalls.push({ channelId, viewMessages, untilDate })
        // Check error/success controls
        if (config.removeAlreadyGoneDialogIds?.includes(channelId)) {
          throw Object.assign(new Error('USER_NOT_PARTICIPANT'), { errorMessage: 'USER_NOT_PARTICIPANT' })
        }
        if (config.removeErrorDialogIds?.[channelId]) {
          const msg = config.removeErrorDialogIds[channelId]!
          throw Object.assign(new Error(msg), { errorMessage: msg })
        }
        return {}  // success
      }

      // ── Phase 5: messages.DeleteChatUser — basic group removal (RMV-02) ──────
      if (ctorName === 'DeleteChatUser' || (request as { className?: string })?.className === 'messages.DeleteChatUser') {
        const chatId = (request as { chatId?: { toString(): string } }).chatId?.toString() ?? ''
        // Record the call for sequence assertions
        _deleteChatUserCalls.push({ chatId })
        // Check error/success controls
        if (config.removeAlreadyGoneDialogIds?.includes(chatId)) {
          throw Object.assign(new Error('USER_NOT_PARTICIPANT'), { errorMessage: 'USER_NOT_PARTICIPANT' })
        }
        if (config.removeErrorDialogIds?.[chatId]) {
          const msg = config.removeErrorDialogIds[chatId]!
          throw Object.assign(new Error(msg), { errorMessage: msg })
        }
        return {}  // success
      }

      // messages.GetFullChat — basic group membership (GRP-01)
      if (ctorName === 'GetFullChat' || (request as { className?: string })?.className === 'messages.GetFullChat') {
        const chatId = (request as { chatId?: { toString(): string } }).chatId?.toString() ?? ''
        const participants = config.basicGroupParticipants?.[chatId] ?? []
        return {
          fullChat: {
            className: 'ChatFull',
            participants: {
              className: 'ChatParticipants',
              participants: participants.map(userId => ({ userId: bigInt(userId) })),
            },
          },
        }
      }

      // Fallback: return a mock result for unrecognised requests
      return {}
    },

    // ── Phase 4: getDialogs — returns mock dialog list ───────────────────────
    getDialogs: async (_params?: unknown): Promise<unknown[]> => {
      if (config.getDialogsError) throw makeRPCError(config.getDialogsError)
      return (config.getDialogsResult ?? []).map((d) => ({
        entity: d.entity === 'Chat'
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? Object.assign(new (Api.Chat as any)({}), { id: bigInt(d.id), creator: d.creator, adminRights: d.adminRights, defaultBannedRights: d.defaultBannedRights, participantsCount: d.participantsCount, migratedTo: d.migratedTo, deactivated: d.deactivated })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          : Object.assign(new (Api.Channel as any)({}), { id: bigInt(d.id), megagroup: d.megagroup, creator: d.creator, adminRights: d.adminRights, defaultBannedRights: d.defaultBannedRights, participantsCount: d.participantsCount }),
        inputEntity: { channelId: bigInt(d.id), accessHash: bigInt.zero },
        title: d.title,
        id: bigInt(d.id),
      }))
    },

    // ── Auth: signInWithPassword ──────────────────────────────────────────────
    // telegram@2.26.22: signInWithPassword(client, apiCredentials, authParams: UserPasswordAuthParams)
    // UserPasswordAuthParams.password is a CALLBACK: (hint?: string) => Promise<string>
    signInWithPassword: async (
      _apiCreds: { apiId: number; apiHash: string },
      authParams: {
        password?: (hint?: string) => Promise<string>
        onError: (err: Error) => Promise<boolean> | void
      }
    ): Promise<unknown> => {
      if (config.signInWithPasswordError) {
        const err = makeRPCError(config.signInWithPasswordError)
        const shouldStop = await authParams.onError(err)
        if (shouldStop !== false) throw err
      }
      // Call the password callback to simulate the GramJS SRP flow
      if (authParams.password) {
        await authParams.password(undefined) // no hint in tests
      }
      const identity = config.identity ?? DEFAULT_IDENTITY
      return { _: 'user', id: identity.id }
    },

    // ── Identity ──────────────────────────────────────────────────────────────
    getMe: async (): Promise<{
      firstName: string
      lastName?: string
      username?: string
      id: { toString: () => string }
    }> => {
      const id = config.identity ?? DEFAULT_IDENTITY
      return {
        firstName: id.firstName,
        lastName: id.lastName,
        username: id.username,
        id: { toString: () => id.id },
      }
    },

    downloadProfilePhoto: async (_entity: unknown): Promise<Buffer | null> => {
      if (config.downloadProfilePhotoError) {
        throw Object.assign(new Error(config.downloadProfilePhotoError), {
          errorMessage: config.downloadProfilePhotoError,
        })
      }
      const id = config.identity ?? DEFAULT_IDENTITY
      if (!id.hasPhoto) return null
      return Buffer.from([0x89, 0x50, 0x4e, 0x47]) // minimal PNG magic bytes
    },

    // ── Phase 5: call-recording accessors ───────────────────────────────────
    // Exposed directly on the client for test assertions after execute().
    // These are the same array instances as config.editBannedCalls / config.deleteChatUserCalls.
    editBannedCalls: _editBannedCalls,
    deleteChatUserCalls: _deleteChatUserCalls,
  }

  return client
}

export type MockTelegramClient = ReturnType<typeof createMockTelegramClient>

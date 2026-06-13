# Phase 3: Target Resolution & Verification — Research

**Researched:** 2026-06-11
**Domain:** GramJS entity resolution, Telegram MTProto contacts API, Electron IPC patterns
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Target input design:**
- D-01: Smart single field — auto-detects intent: `@` or letters → username; `+` or all digits → phone. Detected-mode indicator shows interpretation before submit.
- D-02: Bare digits accepted as phone with visible, changeable country chip (guessed from system locale). International `+` bypasses guess. Phase 1 `CountryPicker` is the chip picker.
- D-03: Resolution fires only on explicit Find button or Enter. No debounced auto-lookup.
- D-04: Pasted Telegram links normalized — strip `t.me/`, `https://t.me/`, leading `@`, `t.me/+<phone>` forms.
- D-05: No target history in v1.
- D-06: No numeric-ID input in v1 — digits always mean phone.

**Phone lookup (REVISED 2026-06-11):**
- D-07 (REVISED): Phone lookup uses `contacts.ResolvePhone` — direct phone-to-peer resolution with no contact import and no contact pollution. No keep/remove dialog, no cleanup path, no pre-existing-contact special case.
- D-08 (OBSOLETE): ~~Keep-or-remove dialog~~ — not applicable under ResolvePhone.
- D-09 (OBSOLETE): ~~Pre-existing contacts guard~~ — trivially satisfied; app never touches contacts.
- D-10 (REVISED): Inline disclosure hint when phone mode detected: phone lookup only works if their privacy settings allow being found by phone number. No contact-import disclosure needed.

**Identity card & confirmation:**
- D-11: Explicit confirm gate — "Yes, this is the person" button unlocks next step.
- D-12: No-avatar fallback = colored initials circle (Telegram-style) PLUS explicit notice. User can still proceed deliberately.
- D-13: Card shows name, @username, numeric ID, bio plus last-seen, premium badge, bot flag (from resolved User object — no extra API calls for these).
- D-14: "Change target" resets flow and clears all downstream state.

**Failure states & retry:**
- D-15: Failures render as inline errors under input field. Input stays editable.
- D-16: Messages cause-specific with actionable hints (TGT-04).
- D-17: FLOOD_WAIT during lookup reuses FloodCountdown pattern, driven by `OP_GOVERNOR_EVENT` `flood-tick` events.
- D-18: Deleted accounts and bots are warned-but-allowed.

### Claude's Discretion

Exact detected-mode indicator design, country-guess source (locale vs IP), card layout details, copy wording, where the resolution state lives in the store, IPC channel naming, and how resolved target state is exposed to Phase 4 — pick sensible defaults consistent with existing patterns. Surface anything load-bearing at planning time.

### Deferred Ideas (OUT OF SCOPE)

- Recent-targets history (electron-store) — D-05 reversal, excluded from v1
- Numeric-ID / `id:` prefix input — D-06 exclusion
- VRF-04 common-groups count — lands with Phase 4 data

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TGT-01 | User can specify the target by username | `contacts.ResolveUsername` — verified in telegram@2.26.22 |
| TGT-02 | User can specify the target by phone number | `contacts.ResolvePhone` (D-07 REVISED) — verified in telegram@2.26.22; Layer 214; no contact import |
| TGT-03 | App resolves to stable numeric user ID early, acts by that ID throughout | `user.id` (bigint) from resolution result → `.toString()` for stable string ID; `accessHash` held in main only |
| TGT-04 | Distinct message per cause: username not found, phone not a contact, no public profile | `USERNAME_NOT_OCCUPIED` RPCError; empty `ImportedContacts.imported`; access_hash-zero guard |
| VRF-01 | Display target's avatar for visual confirmation | `client.downloadProfilePhoto(user)` — returns `Buffer.alloc(0)` for hidden/missing photos |
| VRF-02 | Show text identity: name, username, numeric ID, bio | User entity + `users.GetFullUser` for bio (`UserFull.about`) |
| VRF-03 | No-avatar fallback: clear notice + available details; user can still proceed | Empty buffer → colored initials + no-photo Alert; "Yes, this is the person" still enabled |

</phase_requirements>

---

## Summary

Phase 3 resolves a typed username or phone number to a stable Telegram numeric user ID (bigint, serialized as string), fetches the target's identity for visual confirmation, and gates further action behind an explicit confirmation step. The core technical work is three GramJS API calls wrapped in the Phase 2 governor — username resolution via `contacts.ResolveUsername`, bio fetch via `users.GetFullUser`, and avatar download via `client.downloadProfilePhoto` — plus the phone path through `contacts.ResolvePhone` (D-07 REVISED 2026-06-11 — no contact import, no keep/remove dialog).

All GramJS mechanics were verified directly against `telegram@2.26.22` installed in the project. Critical finding: `user.id` is a `bigint` that exceeds JavaScript's safe integer range for large Telegram IDs, requiring `.toString()` for all serialization. A second critical finding (the open question that drove D-07 revision): `contacts.ResolvePhone` (Telegram Layer 214, constructor `0x8af94344`) is already present in `telegram@2.26.22` and provides clean phone resolution without contact pollution — D-07 was revised to use it (approved 2026-06-11). See Open Questions (RESOLVED) below.

The renderer side follows the established authStore/authClient/preload/IPC pattern exactly. A new `TargetResolver` service in main holds the resolved target (including `accessHash`) and emits typed `TargetState` snapshots to the renderer via a new `target:state` push channel. The renderer receives everything needed for display but never the `accessHash` — that stays in main for downstream Phase 4 use.

**Primary recommendation:** Use direct `client.invoke(new Api.contacts.ResolveUsername({ username }))` rather than `client.getEntity('@username')` for username resolution — the direct invoke preserves the `USERNAME_NOT_OCCUPIED` RPCError in `err.errorMessage`, while `getEntity` wraps it in a generic `Error` without `errorMessage`, defeating the classifier.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Input mode detection + link normalization | Browser/Renderer | — | Client-side logic; no API call; runs on every keystroke |
| Country guess from locale | Browser/Renderer | — | `navigator.language` / `Intl` is renderer context; offline-safe (D-10) |
| Username client-side validation | Browser/Renderer | — | Pre-send gate; prevents malformed requests; no API call |
| Phone format validation | Browser/Renderer | — | `libphonenumber-js` already in renderer; pre-send gate |
| Entity resolution (username / phone) | Main Process / API | — | Telegram calls must stay in main; governor lives in main |
| Bio fetch (`users.GetFullUser`) | Main Process / API | — | Second governor-routed API call; result serialized to DTO |
| Avatar download (`downloadProfilePhoto`) | Main Process / API | — | Third governor-routed API call; bytes serialized to Uint8Array |
| Contact import side-effect detection | N/A — OBSOLETE | — | `contacts.ResolvePhone` adds nothing to contacts (D-07 REVISED) |
| Contact cleanup (`DeleteByPhones` / `DeleteContacts`) | N/A — OBSOLETE | — | No contact was imported; no cleanup needed (D-07 REVISED) |
| Resolved target state (including `accessHash`) | Main Process | — | `accessHash` must NOT cross to renderer (security boundary) |
| FLOOD_WAIT countdown display | Browser/Renderer | Main (event source) | Renderer subscribes to `OP_GOVERNOR_EVENT` for `flood-tick` |
| Keep-or-remove dialog | N/A — OBSOLETE | — | Not needed under `contacts.ResolvePhone`; D-08 obsolete (D-07 REVISED) |
| Identity card display + confirm gate | Browser/Renderer | — | Purely UI; reads typed TargetState from targetStore |

---

## Standard Stack

### Core (all already installed — no new npm packages)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `telegram` (GramJS) | 2.26.22 | `contacts.ResolveUsername`, `contacts.ImportContacts`, `users.GetFullUser`, `downloadProfilePhoto`, all Telegram API calls | [VERIFIED: npm registry] Already in project; only MTProto user client with these capabilities |
| `libphonenumber-js` | 1.13.6 | Phone format validation + E.164 construction from bare digits + country chip | [VERIFIED: npm registry] Already in `CountryPicker.tsx`; exports `DEFAULT_COUNTRY`, `COUNTRY_OPTIONS` |
| `lucide-react` | 1.17.0 | Icons: `AtSign`, `Phone`, `ImageOff`, `CheckCircle2`, `Ghost`, `Loader2`, `Star` | [VERIFIED: npm registry] Already in project; per UI-SPEC |
| `zod` | 4.4.3 | IPC payload validation in `main/ipc/targetChannels.ts` | [VERIFIED: npm registry] Already in project; established pattern from `authChannels.ts` |

### New UI Component

| Component | Source | Purpose |
|-----------|--------|---------|
| `badge` | `npx shadcn add badge` (official registry) | Deleted account / Bot / Premium chips on identity card (UI-SPEC) |

Note: `badge` is a pure Tailwind/CSS component — no Radix peer dependency. No new npm package needed.

**Version verification (npm view, run 2026-06-11):**
- `telegram`: 2.26.22 [VERIFIED: npm registry]
- `libphonenumber-js`: 1.13.6 [VERIFIED: npm registry]
- `lucide-react`: 1.17.0 [VERIFIED: npm registry]

---

## Package Legitimacy Audit

> Phase 3 installs NO new npm packages. All dependencies are already present in `package.json` and were vetted in prior phases.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `telegram` (GramJS) | npm | 5+ yrs | Millions/month | github.com/gram-js/gramjs | N/A — pre-existing | Already approved (Phase 1) |
| `libphonenumber-js` | npm | 8+ yrs | 100M+/week | github.com/nicolo-ribaudo | N/A — pre-existing | Already approved (Phase 1) |

**New component:** `npx shadcn add badge` — official shadcn/ui registry (https://ui.shadcn.com/r/badge.json). Not an npm package; copied locally. No slopcheck needed for official shadcn registry.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
Renderer                    Preload (contextBridge)    Main Process
--------                    ----------------------     ------------

TargetInput.tsx             window.mrproper            targetChannels.ts
  |                           .resolveTarget()  ──►    ipcMain.handle('target:resolve')
  | (Find / Enter)             .confirmTarget()         ipcMain.handle('target:confirm')
  |                            .resetTarget()           ipcMain.handle('target:reset')
  ▼                                                          |
targetStore.ts                                              ▼
  |                                                  TargetResolver.ts
  | useSyncExternalStore                              (holds resolved User entity
  |                                                   + accessHash in main only)
  ◄── target:state (push) ◄── ipcRenderer.on ◄──          |
                                                    RateLimitGovernor.run()
  ◄── op:governorEvent ◄───── ipcRenderer.on ◄──          |
      (flood-tick for Find                         ┌────────┴──────────┐
       button countdown)               USERNAME: contacts.ResolveUsername
                                       PHONE:    contacts.ResolvePhone (D-07 REVISED)
                                                           |
                                                  users.GetFullUser (bio)
                                                           |
                                                  downloadProfilePhoto (avatar)
```

### Recommended Project Structure (additions only)

```
src/
├── main/
│   ├── ipc/
│   │   └── targetChannels.ts    # New: IPC handler registrations for target:* channels
│   └── telegram/
│       └── TargetResolver.ts    # New: resolution service (sibling to SessionManager)
├── renderer/
│   ├── ipc/
│   │   └── targetClient.ts      # New: typed window.mrproper.* bridge for target ops
│   ├── store/
│   │   └── targetStore.ts       # New: useSyncExternalStore for TargetState
│   └── target/
│       ├── TargetInput.tsx       # New: smart single-field input with mode detection
│       ├── TargetCard.tsx        # New: identity card with confirm gate
│       └── resolveCopy.ts        # New: all resolution strings (extends errorCopy pattern)
│       # Note: KeepOrRemoveDialog.tsx removed — not needed under ResolvePhone (D-07 REVISED)
├── shared/
│   ├── targetTypes.ts           # New: TargetState, TargetErrorCode, ResolvedTargetDTO
│   └── channels.ts              # Extended: add TARGET_* channel constants
```

### Pattern 1: Direct `invoke` for Preserved RPCErrors

**What:** Use `client.invoke(new Api.contacts.ResolveUsername({ username }))` directly — not `client.getEntity('@username')`.

**When to use:** Any time you need the raw `RPCError.errorMessage` for the classifier. `client.getEntity()` wraps `USERNAME_NOT_OCCUPIED` in a generic `Error` without `.errorMessage`, so `classifyRpcError` cannot distinguish it from a network error.

**Example:**
```typescript
// Source: verified against telegram@2.26.22 users.js _getEntityFromString()

// CORRECT — RPCError preserved:
const result = await this._governor.run(() =>
  this._client.invoke(new Api.contacts.ResolveUsername({ username: cleanUsername }))
) as Api.contacts.ResolvedPeer

// The governor's classifyRpcError sees errorMessage === 'USERNAME_NOT_OCCUPIED'
// and maps it to TARGET_USERNAME_NOT_FOUND with disposition: 'fail'

// WRONG — RPCError wrapped:
// const user = await this._governor.run(() => this._client.getEntity('@' + username))
// → USERNAME_NOT_OCCUPIED becomes new Error('No user has "x" as username')
//   with no .errorMessage — classifyRpcError cannot classify it
```

### Pattern 2: Username Resolution

```typescript
// Source: verified against telegram@2.26.22 Api.contacts.ResolveUsername

async resolveByUsername(username: string): Promise<ResolvedTargetDTO> {
  // 1. Resolve to User entity
  const resolved = await this._governor.run(() =>
    this._client.invoke(new Api.contacts.ResolveUsername({ username }))
  ) as Api.contacts.ResolvedPeer

  if (!(resolved.peer instanceof Api.PeerUser)) {
    // Username resolves to a channel/group — not a user target
    throw classifyAsTargetError('TARGET_NO_PUBLIC_PROFILE')
  }

  const targetUser = resolved.users.find(u =>
    (u as Api.User).id === (resolved.peer as Api.PeerUser).userId
  ) as Api.User

  // 2. Fetch bio (graceful failure — bio = null if GetFullUser fails)
  let bio: string | null = null
  try {
    const inputPeer = new Api.InputPeerUser({
      userId: targetUser.id,
      accessHash: targetUser.accessHash!,
    })
    const fullResult = await this._governor.run(() =>
      this._client.invoke(new Api.users.GetFullUser({ id: inputPeer }))
    ) as Api.users.UserFull
    bio = fullResult.fullUser.about ?? null
  } catch { /* graceful */ }

  // 3. Fetch avatar (empty buffer → null avatar)
  const photoBuffer = await this._governor.run(() =>
    this._client.downloadProfilePhoto(targetUser)
  )
  const avatar = photoBuffer && photoBuffer.length > 0
    ? new Uint8Array(photoBuffer as Buffer)
    : null

  return buildTargetDTO(targetUser, bio, avatar)
}
```

### Pattern 3: Phone Resolution via `contacts.ImportContacts` (OBSOLETE — superseded by `contacts.ResolvePhone` per D-07 REVISED)

> **This pattern is obsolete.** D-07 was revised 2026-06-11 to use `contacts.ResolvePhone` (no contact import, no contact pollution, no cleanup path, no keep/remove dialog). The code below is retained for reference only. Executors MUST NOT implement this pattern. See Pattern below for `contacts.ResolvePhone` usage (implemented in TargetResolver.ts Plan 03-01).

```typescript
// Source: verified against telegram@2.26.22 Api.contacts.ImportContacts

async resolveByPhone(e164Phone: string): Promise<ResolvedTargetDTO & { appImported: boolean }> {
  const clientId = BigInt(Date.now()) // unique per-import handle

  const result = await this._governor.run(() =>
    this._client.invoke(new Api.contacts.ImportContacts({
      contacts: [new Api.InputPhoneContact({
        clientId,
        phone: e164Phone,
        firstName: 'MrProper',
        lastName: 'Lookup',
      })],
    }))
  ) as Api.contacts.ImportedContacts

  if (result.imported.length === 0) {
    // Phone not found or privacy blocks lookup — silent cleanup (D-08)
    // (retryContacts will contain our clientId)
    await this._silentCleanupByPhone(e164Phone)
    throw classifyAsTargetError('TARGET_PHONE_NOT_FOUND')
  }

  const importedUserId = result.imported[0].userId
  const targetUser = result.users.find(u =>
    (u as Api.User).id === importedUserId
  ) as Api.User

  // D-09: detect pre-existing contact via User.contact flag
  const appImported = !targetUser.contact

  // Continue with GetFullUser + downloadProfilePhoto (same as username path)
  // ...
  return { ...buildTargetDTO(targetUser, bio, avatar), appImported }
}

private async _silentCleanupByPhone(phone: string): Promise<void> {
  try {
    await this._governor.run(() =>
      this._client.invoke(new Api.contacts.DeleteByPhones({ phones: [phone] }))
    )
  } catch { /* best-effort */ }
}
```

### Pattern 4: `bigint` ID Serialization

```typescript
// Source: verified — user.id is bigint in telegram@2.26.22; can exceed Number.MAX_SAFE_INTEGER

// TGT-03: stable numeric user ID as string (never Number())
const id = targetUser.id.toString()       // e.g. "1234567890123456789"
const accessHash = targetUser.accessHash!.toString()  // stored in main only

// For subsequent API calls in main (Phase 4):
const inputUser = new Api.InputUser({
  userId: BigInt(id),           // reconstruct from string
  accessHash: BigInt(accessHash),
})
```

### Pattern 5: `TargetState` Discriminated Union

```typescript
// Source: modeled on AuthState in src/shared/authTypes.ts

// src/shared/targetTypes.ts
export type TargetErrorCode =
  | 'TARGET_USERNAME_NOT_FOUND'
  | 'TARGET_PHONE_NOT_FOUND'
  | 'TARGET_NO_PUBLIC_PROFILE'
  | 'FLOOD_WAIT'
  | 'NETWORK'
  | 'UNKNOWN'

// DTO for the renderer — NO accessHash
export interface ResolvedTargetDTO {
  id: string              // bigint.toString() — TGT-03 stable ID
  name: string
  username: string | null
  bio: string | null
  avatar: Uint8Array | null
  deleted: boolean
  bot: boolean
  premium: boolean
  lastSeen: string | null  // humanized from UserStatus enum
  pendingContactRemoval: boolean  // true when app-imported phone contact awaits user choice
}

export type TargetState =
  | { step: 'idle' }
  | { step: 'resolving' }
  | { step: 'resolved'; target: ResolvedTargetDTO }
  // Note: 'pendingContact' step removed — not needed under contacts.ResolvePhone (D-07 REVISED)
  | { step: 'confirmed'; target: ResolvedTargetDTO }
  | { step: 'error'; code: TargetErrorCode; input: string }
```

### Pattern 6: `UserStatus` → Human-Readable Last-Seen

```typescript
// Source: verified — GramJS UserStatus subtypes in telegram@2.26.22

import { Api } from 'telegram'

export function humanizeLastSeen(status: Api.TypeUserStatus | undefined): string | null {
  if (!status) return null
  if (status instanceof Api.UserStatusOnline) return 'Online'
  if (status instanceof Api.UserStatusOffline) return `Last seen ${humanizeTimestamp(status.wasOnline)}`
  if (status instanceof Api.UserStatusRecently) return 'Last seen recently'
  if (status instanceof Api.UserStatusLastWeek) return 'Last seen within a week'
  if (status instanceof Api.UserStatusLastMonth) return 'Last seen within a month'
  if (status instanceof Api.UserStatusEmpty) return null
  return null
}
// UI-SPEC: "Last seen {humanized}" / "Online" / "Last seen recently" / "Last seen a long time ago"
// Map UserStatusLastWeek + UserStatusLastMonth → "Last seen a long time ago" (UI-SPEC)
```

### Pattern 7: `OperationErrorCode` Extension

```typescript
// Source: src/shared/opTypes.ts — Phase 2 comment: "Phase 5 extends this with..."

// Extend in src/shared/opTypes.ts:
export type OperationErrorCode =
  | 'FLOOD_WAIT'
  | 'PEER_FLOOD'
  | 'SESSION_INVALID'
  | 'NETWORK'
  | 'UNKNOWN'
  | 'TARGET_USERNAME_NOT_FOUND'   // Phase 3 addition
  | 'TARGET_PHONE_NOT_FOUND'      // Phase 3 addition
  | 'TARGET_NO_PUBLIC_PROFILE'    // Phase 3 addition

// Extend classifyRpcError in src/main/telegram/operationErrors.ts:
// After existing branches, add:
if (errorMessage === 'USERNAME_NOT_OCCUPIED') {
  return { code: 'TARGET_USERNAME_NOT_FOUND', disposition: 'fail' }
}
// Note: TARGET_PHONE_NOT_FOUND is logic-level (empty ImportContacts result),
// not an RPCError — it is NOT classified by classifyRpcError.
// TargetResolver creates it directly: { code: 'TARGET_PHONE_NOT_FOUND', disposition: 'fail' }
```

### Anti-Patterns to Avoid

- **`client.getEntity('@username')` for classified errors:** Wraps `USERNAME_NOT_OCCUPIED` in a generic Error that defeats the classifier. Use `client.invoke(new Api.contacts.ResolveUsername(...))` directly.
- **`Number(user.id)` for Telegram user IDs:** Unsafe for IDs > 2^53. Telegram IDs are 64-bit. Always use `.toString()`. (Verified: `Number('1234567890123456789')` → `1234567890123456800` — wrong.)
- **Sending `accessHash` to renderer:** `accessHash` is a private API credential. It stays in main. The renderer receives only the string `id`.
- **Showing keep/remove dialog for pre-existing contacts:** Check `User.contact === true` from `ImportContacts` result; if so, skip the dialog entirely (D-09).
- **Using contacts.ImportContacts on failed lookup without cleanup:** When `result.imported.length === 0`, call `contacts.DeleteByPhones` silently before surfacing the error (D-08).
- **Using `client.getEntity(phone)` for phone resolution:** GramJS's `_getEntityFromString` for phones only scans existing contacts via `contacts.GetContacts` — it does not import. This is not the D-07..D-10 flow.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate limiting for resolution calls | Custom delay/retry | `RateLimitGovernor.run()` | Already built + tested in Phase 2; every post-auth call must go through it |
| BigInt phone/id serialization | Custom conversion | `.toString()` / `BigInt(str)` | Direct language primitive; no library needed |
| Phone country code list | Custom country data | `libphonenumber-js/min` (already in repo) | Already used in `CountryPicker.tsx`; exports `COUNTRY_OPTIONS`, `DEFAULT_COUNTRY` |
| Last-seen humanization | Custom date math | Small `humanizeLastSeen()` util per pattern above | UserStatus is an enum-like discriminated union; instanceof check is clean + complete |
| Username validation | Custom regex | Simple `/^[a-zA-Z0-9_]{5,32}$/` + check | Telegram's documented rule is simple and stable |
| Contact state tracking | Custom storage | `User.contact` boolean on the returned User entity | Telegram surfaces this directly; no local state needed |

**Key insight:** Every Telegram API call in this phase is a thin wrapper around `this._governor.run(() => this._client.invoke(...))`. The complexity is in error mapping and state management, not in the API calls themselves.

---

## Common Pitfalls

### Pitfall 1: `client.getEntity` Swallows `USERNAME_NOT_OCCUPIED`

**What goes wrong:** `client.getEntity('@username')` calls `contacts.ResolveUsername` internally but catches `USERNAME_NOT_OCCUPIED` and re-throws as `new Error('No user has "x" as username')` — a plain Error without `.errorMessage`. `classifyRpcError` receives no `errorMessage` and classifies it as `NETWORK` / `retry`, causing governor to retry 3 times before propagating a wrong error code.

**Why it happens:** GramJS `_getEntityFromString` is designed to be convenient for interactive use, not for applications that need to classify errors precisely.

**How to avoid:** Use direct `invoke(new Api.contacts.ResolveUsername({ username }))`. The RPCError with `errorMessage === 'USERNAME_NOT_OCCUPIED'` reaches `classifyRpcError` intact.

**Warning signs:** FLOOD_WAIT budget exhausted on a simple username lookup; error shows as NETWORK in UI when the username clearly doesn't exist.

### Pitfall 2: `user.id` is `bigint`, Not `number`

**What goes wrong:** `Number(user.id)` silently loses precision for large Telegram user IDs (common with modern `10-digit` accounts). Storing as a JavaScript `number` corrupts the ID.

**Why it happens:** JavaScript `Number` is a 64-bit float with only 53-bit mantissa. Telegram's 64-bit integer IDs exceed this safely. Verified: `Number('1234567890123456789')` → `1234567890123456800`.

**How to avoid:** Serialize with `user.id.toString()` and reconstruct with `BigInt(idStr)` in main when passing to API calls. The renderer only needs the string form.

**Warning signs:** TypeScript `bigint` type error on `Number(user.id)`; numeric ID in UI doesn't match actual Telegram ID.

### Pitfall 3: Phone Not Found is Not an RPCError

**What goes wrong:** Code waits for an RPCError from `contacts.ImportContacts` when the phone doesn't resolve. None is thrown. The result silently returns `imported: []`.

**Why it happens:** Telegram's `ImportContacts` is a bulk operation; individual contact failures are reported as items in `retryContacts`, not as thrown errors.

**How to avoid:** Check `result.imported.length === 0` after the call. Emit `TARGET_PHONE_NOT_FOUND` as a logic-level error (not via `classifyRpcError`). Then call `contacts.DeleteByPhones` for silent cleanup.

**Warning signs:** App appears to hang after phone lookup with no error; `result.retryContacts` contains the `clientId` you submitted.

### Pitfall 4: `accessHash` Leak to Renderer

**What goes wrong:** `accessHash` is sent to the renderer as part of a target state snapshot, where it could be accessed by renderer code or exfiltrated via the webContents surface.

**Why it happens:** Copy-paste from `Identity` type which doesn't have `accessHash`.

**How to avoid:** `ResolvedTargetDTO` (renderer-facing) contains only `id: string`. The `accessHash: string` lives only in `TargetResolver`'s internal state in main, used when building `InputUser` for Phase 4 calls.

**Warning signs:** TypeScript type `TargetState` or `ResolvedTargetDTO` has an `accessHash` field.

### Pitfall 5: Bio Fetch Blocks Resolution on Failure

**What goes wrong:** `users.GetFullUser` throws (network error, flood wait, or user has restricted full profile access) and the entire resolution fails — even though the User entity was resolved successfully.

**Why it happens:** Bio fetch is chained after username resolution without error isolation.

**How to avoid:** Wrap `users.GetFullUser` in a `try/catch`; on any error set `bio = null` and continue. Bio is display-only — absent bio must never block confirmation.

**Warning signs:** Username resolution fails with an error that mentions `GetFullUser`.

### Pitfall 6: Pre-Existing Contact Gets Deleted (D-09 Violation)

**What goes wrong:** The keep/remove dialog is shown for a phone that was already in the admin's Telegram contacts before the lookup. User chooses "Remove" and loses a genuine contact.

**Why it happens:** Code skips the `User.contact` check after `ImportContacts` and always shows the dialog.

**How to avoid:** After `ImportContacts` succeeds, inspect `result.users[0].contact`. If `true`, the phone was already a contact before import — no dialog, never offer deletion (D-09).

**Warning signs:** UI shows keep/remove dialog even when no import was actually performed.

### Pitfall 7: Telegram Link Normalization Misses `t.me/+phone` Form

**What goes wrong:** `https://t.me/+420123456789` pasted into the field is not recognized as a phone number — it passes the `@`/letter test and is treated as a username.

**Why it happens:** Normalization handles `t.me/username` but not the `t.me/+phone` invite form (D-04).

**How to avoid:** Normalization must: (1) strip `https://` and `http://`; (2) strip `t.me/`; (3) if the remainder starts with `+` and digits, treat as phone with international prefix.

---

## Code Examples

Verified patterns from GramJS source and installed packages:

### Username Resolution (Full Sequence)

```typescript
// Source: verified telegram@2.26.22 Api.contacts.ResolveUsername, Api.users.GetFullUser

import { Api } from 'telegram'

// Step 1: Resolve to User entity
const resolved = await this._governor.run(() =>
  this._client.invoke(new Api.contacts.ResolveUsername({ username: cleanUsername }))
) as Api.contacts.ResolvedPeer
// throws with errorMessage === 'USERNAME_NOT_OCCUPIED' if not found

// Step 2: Extract user from result
const peerId = (resolved.peer as Api.PeerUser).userId
const user = resolved.users.find(u => (u as Api.User).id === peerId) as Api.User

// Step 3: Fetch bio (graceful)
let bio: string | null = null
try {
  const inputPeer = new Api.InputPeerUser({ userId: user.id, accessHash: user.accessHash! })
  const fullUser = await this._governor.run(() =>
    this._client.invoke(new Api.users.GetFullUser({ id: inputPeer }))
  ) as Api.users.UserFull
  bio = fullUser.fullUser.about ?? null
} catch { /* bio remains null */ }

// Step 4: Fetch avatar
const photoBuffer = await this._governor.run(() =>
  this._client.downloadProfilePhoto(user)
) as Buffer | null
const avatar = photoBuffer && photoBuffer.length > 0 ? new Uint8Array(photoBuffer) : null
// Buffer.alloc(0) → length === 0 → null → colored initials + no-photo notice (D-12)
```

### Phone Resolution via ImportContacts

```typescript
// Source: verified telegram@2.26.22 Api.contacts.ImportContacts, Api.InputPhoneContact

const clientId = BigInt(Date.now())
const result = await this._governor.run(() =>
  this._client.invoke(new Api.contacts.ImportContacts({
    contacts: [new Api.InputPhoneContact({
      clientId,
      phone: e164Phone,      // e.g. '+420123456789'
      firstName: 'MrProper',
      lastName: 'Lookup',
    })],
  }))
) as Api.contacts.ImportedContacts

if (result.imported.length === 0) {
  // Silent cleanup (D-08) — best-effort
  await this._silentCleanup(e164Phone)
  // Emit TARGET_PHONE_NOT_FOUND (logic-level, not RPCError)
  return
}

const user = result.users.find(u =>
  (u as Api.User).id === result.imported[0].userId
) as Api.User

const appImported = !user.contact // D-09: true if we just added it, false if pre-existing
```

### Contact Cleanup

```typescript
// Source: verified telegram@2.26.22 Api.contacts.DeleteByPhones, Api.contacts.DeleteContacts

// After failed phone lookup — silent (D-08)
await this._governor.run(() =>
  this._client.invoke(new Api.contacts.DeleteByPhones({ phones: [e164Phone] }))
)

// After successful phone lookup, user chose "Remove contact"
const inputUser = new Api.InputUser({ userId: user.id, accessHash: user.accessHash! })
await this._governor.run(() =>
  this._client.invoke(new Api.contacts.DeleteContacts({ id: [inputUser] }))
)
```

### Colored Initials Palette (Deterministic, Telegram-style)

```typescript
// Source: UI-SPEC — D-12 palette, keyed by numericUserId % 7

const AVATAR_COLORS = [
  '#E17076', // red
  '#FAA774', // orange
  '#A695E7', // violet
  '#7BC862', // green
  '#6EC9CB', // cyan
  '#65AADD', // blue
  '#EE7AAE', // pink
] as const

export function getAvatarColor(numericId: string): string {
  // Parse last few digits safely (full bigint mod 7)
  const id = BigInt(numericId)
  const index = Number(id % 7n)
  return AVATAR_COLORS[index]
}
```

### Locale-Based Country Guess

```typescript
// Source: D-02 / D-10 — system locale, never IP (offline-safe)
// Uses Intl API available in renderer; CountryPicker exports DEFAULT_COUNTRY fallback

import { COUNTRY_OPTIONS, DEFAULT_COUNTRY } from '@renderer/auth/CountryPicker'

export function guessCountryFromLocale(): CountryOption {
  try {
    const locale = new Intl.Locale(navigator.language)
    const region = locale.region?.toUpperCase()  // e.g. 'CZ' from 'cs-CZ'
    if (region) {
      const match = COUNTRY_OPTIONS.find(c => c.code === region)
      if (match) return match
    }
  } catch { /* fallback */ }
  return DEFAULT_COUNTRY  // US
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `contacts.ImportContacts` as only phone resolution method | `contacts.ResolvePhone` added (Layer 214) | Telegram schema update | **D-07 REVISED 2026-06-11 — Phase 3 now uses `ResolvePhone`.** `ImportContacts` path is obsolete (Pattern 3 marked obsolete). |
| `keytar` for OS credential storage | Electron `safeStorage` | Electron 15+ | Already adopted in Phase 1 |
| `getEntity()` for entity resolution | Direct `invoke(ResolveUsername)` for classified errors | Always the right approach for error classification | Applied in Phase 3 |

**Deprecated/outdated:**
- `client.getEntity('@username')` for resolution when you need to classify the error: use direct `invoke` instead.
- Telethon (archived on GitHub Feb 2026): already excluded in CLAUDE.md. Not relevant here.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `contacts.ImportContacts` result sets `User.contact = true` for phones already in contacts before import | Architecture Patterns §Pattern 3 | D-09 pre-existing contact detection breaks; dialog could appear for pre-existing contacts |
| A2 | `User.contact` is `false` for a phone newly imported via `contacts.ImportContacts` (i.e., the field reflects the pre-import state) | Architecture Patterns §Pattern 3 | D-09 logic inverted; app never shows dialog |
| A3 | `users.GetFullUser` may fail for users who have set privacy to maximum restriction | Code Examples | Bio is always null for privacy-protected users; graceful null is correct handling |
| A4 | `contacts.DeleteByPhones` silently no-ops if the phone is not in contacts (safe to call on failed import cleanup) | Code Examples | May throw `CONTACT_ID_INVALID` on some error paths; wrap in try/catch |

**The `User.contact` assumptions (A1, A2)** are the highest-risk. They are [ASSUMED] — confirmed by Telegram's documented behavior but not verified via a live API call in this session. The planner should add a test that verifies the `User.contact` flag behavior.

---

## Open Questions (RESOLVED)

1. **`contacts.ResolvePhone` vs. `contacts.ImportContacts` — RESOLVED 2026-06-11**
   - What we found: `contacts.ResolvePhone` (Telegram Layer 214, constructor `0x8af94344`) is present in `telegram@2.26.22`. It directly resolves a phone to `contacts.ResolvedPeer` without contact pollution. Error: `PHONE_NOT_OCCUPIED`.
   - Decision: D-07 was revised to use `contacts.ResolvePhone`. User approved the switch at planning time (2026-06-11). This eliminates the keep/remove dialog, contact cleanup path, pre-existing-contact special case, and `KeepOrRemoveDialog.tsx` entirely. The phone privacy restriction (lookup works only if the target's settings allow being found by phone number) applies equally to both methods.
   - D-07 REVISED, D-08 OBSOLETE, D-09 OBSOLETE, D-10 REVISED — all reflected in CONTEXT.md.

2. **`User.contact` flag behavior — MOOT under ResolvePhone**
   - `contacts.ResolvePhone` never adds the looked-up phone to the admin's contacts. The `User.contact` flag is irrelevant — there is no contact import to clean up or detect. This question does not apply to Phase 3 implementation.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | GramJS, main process | ✓ | 22.22.0 | — |
| `telegram` (GramJS) | Entity resolution | ✓ | 2.26.22 | — |
| `libphonenumber-js` | Phone parsing | ✓ | 1.13.6 | — |
| `lucide-react` | Icons in UI | ✓ | 1.17.0 | — |
| shadcn `badge` component | Identity card badges | ✗ (not yet added) | — | Run `npx shadcn add badge` as first Wave 0 task |
| Vitest | Tests | ✓ | 4.1.8 | — |

**Missing dependencies with no fallback:** none (shadcn `badge` is a copy operation, not a runtime dep)
**Missing dependencies with fallback:** none

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.8 |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npm test -- --reporter=verbose src/main/telegram/targetResolver.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TGT-01 | Username resolves to User entity via `ResolveUsername` | unit | `npm test -- src/main/telegram/targetResolver.test.ts` | ❌ Wave 0 |
| TGT-01 | `USERNAME_NOT_OCCUPIED` → `TARGET_USERNAME_NOT_FOUND` error code | unit | `npm test -- src/main/telegram/targetResolver.test.ts` | ❌ Wave 0 |
| TGT-01 | `classifyRpcError` maps `USERNAME_NOT_OCCUPIED` to `TARGET_USERNAME_NOT_FOUND` | unit | `npm test -- src/main/telegram/operationErrors.test.ts` | ✅ (extend existing) |
| TGT-02 | Phone resolves via `contacts.ResolvePhone`; `PHONE_NOT_OCCUPIED` → TARGET_PHONE_NOT_FOUND | unit | `npm test -- src/main/telegram/targetResolver.test.ts` | ❌ Wave 0 |
| TGT-02 | `PHONE_NOT_OCCUPIED` RPCError → `TARGET_PHONE_NOT_FOUND` (no cleanup needed) | unit | `npm test -- src/main/telegram/targetResolver.test.ts` | ❌ Wave 0 |
| TGT-03 | Resolved user ID is stored as `bigint.toString()`; Number() overflow confirmed | unit | `npm test -- src/main/telegram/targetResolver.test.ts` | ❌ Wave 0 |
| TGT-04 | All 3 error codes produced with correct `disposition: 'fail'` | unit | `npm test -- src/main/telegram/operationErrors.test.ts` | ✅ (extend existing) |
| VRF-01 | Empty buffer from `downloadProfilePhoto` → `avatar: null` | unit | `npm test -- src/main/telegram/targetResolver.test.ts` | ❌ Wave 0 |
| VRF-02 | `users.GetFullUser` failure → graceful `bio: null` (resolution still succeeds) | unit | `npm test -- src/main/telegram/targetResolver.test.ts` | ❌ Wave 0 |
| VRF-03 | Confirm gate: `target:confirm` IPC advances state from `resolved` to `confirmed` | unit | `npm test -- src/main/ipc/targetChannels.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test -- src/main/telegram/targetResolver.test.ts src/main/telegram/operationErrors.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/main/telegram/targetResolver.test.ts` — covers TGT-01..04, VRF-01..02
- [ ] `src/main/ipc/targetChannels.test.ts` — covers VRF-03 confirm gate
- [ ] `src/shared/targetTypes.ts` — TargetState, TargetErrorCode, ResolvedTargetDTO
- [ ] `src/shared/channels.ts` — add `TARGET_*` channel constants
- [ ] `src/shared/opTypes.ts` — extend `OperationErrorCode` with 3 new codes
- [ ] `npx shadcn add badge` — badge component for identity card

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — (auth is Phase 1) |
| V3 Session Management | no | — (session is Phase 1) |
| V4 Access Control | no | — (no role gates in this phase) |
| V5 Input Validation | yes | Zod validation on all IPC payloads; client-side username/phone pre-validation before API call |
| V6 Cryptography | no | — (no new crypto; safeStorage is Phase 1) |

### Known Threat Patterns for GramJS Resolution

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| `accessHash` exfiltration via IPC | Information Disclosure | `accessHash` never included in `ResolvedTargetDTO`; stays in `TargetResolver` main-only state |
| Wrong person confirmed via stale UI | Spoofing | Two-gate design: visual confirm (Phase 3) + final review with numeric ID (Phase 6) |
| Input injection via pasted Telegram links | Tampering | Normalization + Zod validation on the string before governor.run(); username validated against `/^[a-zA-Z0-9_]{5,32}$/` |
| Contact pollution without user knowledge | Privacy | D-10 inline disclosure (revised); contacts.ResolvePhone adds nothing to contacts — no import, no pollution, no cleanup needed (D-07 REVISED) |
| Resolution of wrong account due to bigint truncation | Tampering | `user.id.toString()` for all serialization; never `Number(user.id)` |

---

## Sources

### Primary (HIGH confidence — verified directly in installed packages)

- `telegram@2.26.22` installed at `node_modules/telegram/` — All GramJS API shapes verified via `node -e` inspection: `contacts.ResolveUsername`, `contacts.ImportContacts`, `contacts.ResolvePhone`, `contacts.DeleteContacts`, `contacts.DeleteByPhones`, `users.GetFullUser`, `Api.User` fields, `UserStatus` subtypes, `contacts.ResolvedPeer`, `contacts.ImportedContacts`, `Api.UserFull.about`, `downloadProfilePhoto` source logic (returns `Buffer.alloc(0)` for hidden photos), RPCError `.errorMessage` canonical field, `_getEntityFromString` source (confirms wrapping of USERNAME_NOT_OCCUPIED)
- `libphonenumber-js@1.13.6` installed at `node_modules/libphonenumber-js/` — Verified `parsePhoneNumberFromString`, `E.164` output, `Intl` region extraction pattern
- Existing project codebase — `SessionManager.ts` (lines 402–418 `_fetchIdentity` pattern), `governor.ts` (Phase 2 verified), `operationErrors.ts` (classifier extension point), `channels.ts`, `authStore.ts` (useSyncExternalStore pattern), `IdentityDisplay.tsx` (`bytesToDataUrl`, `getInitials`), `CountryPicker.tsx` (`CountryOption`, `DEFAULT_COUNTRY`, `COUNTRY_OPTIONS` exports), `FloodCountdown.tsx` (timing-source-agnostic pattern), `authTypes.ts` (discriminated union model)

### Secondary (MEDIUM confidence — official docs)

- `https://core.telegram.org/method/contacts.resolvePhone` — Confirmed `contacts.resolvePhone` is Layer 214; error `PHONE_NOT_OCCUPIED`; works only if privacy allows. [CITED: core.telegram.org]
- CLAUDE.md tech stack section — Confirmed GramJS 2.26.22, Electron 42.x, floodSleepThreshold=0, safeStorage patterns [CITED: project CLAUDE.md]

### Tertiary (LOW confidence — not separately verified)

- Telegram's documented behavior that `User.contact = true` for pre-existing contacts after `ImportContacts` — assumed from API semantics (A1/A2 in Assumptions Log)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages already installed, all API shapes verified via direct node inspection
- Architecture: HIGH — follows exact patterns from Phase 1/2 codebase; no novel structures
- GramJS API mechanics: HIGH — verified directly against installed telegram@2.26.22 source
- `User.contact` flag behavior (A1/A2): LOW — assumed from API semantics, not live-tested

**Research date:** 2026-06-11
**Valid until:** 2026-07-11 (GramJS 2.26.22 pinned; Telegram API stable for these methods)

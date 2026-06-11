# Phase 4: Group Enumeration, Membership & Rights — Research

**Researched:** 2026-06-11
**Domain:** GramJS dialog enumeration, per-group membership verification, admin rights detection, Electron window resize, Tailwind two-pane layout
**Confidence:** HIGH for GramJS API layer (verified against installed telegram@2.26.22 types + runtime source); HIGH for established project patterns (read from codebase); MEDIUM for UI layout strategy (pattern-based, no Radix/Tailwind doc lookup needed beyond project conventions)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Group list ordering & rows**
- D-01: Actionable groups ALWAYS sort first; greyed (non-actionable) rows grouped below. Within each section the user can toggle sort: A–Z (default) or member count.
- D-02: Each row shows group avatar, name, member count, and the removal checkbox.
- D-03: Grey-out reason is an inline muted subtext under the group name — always visible, no hover required.
- D-04: Group-type badges (Group/Supergroup/Channel) appear ONLY on greyed rows, where type explains non-actionability. Actionable rows stay clean.

**Scan progress UX**
- D-05: Membership-scan results stream in: verified-member groups appear one by one as each governor-paced check completes, with a progress indicator ("checked 12/47").
- D-06: The checklist is interactive during the scan — already-verified rows are immediately toggleable. Only the final remove action (Phase 5/6) requires scan completion.
- D-07: A failed per-group check shows the group greyed with "couldn't verify — retry" inline subtext and a per-row retry affordance. Failures are never silently dropped.
- D-08: The dialog (group) list is fetched eagerly right after login (paginated, governor-routed) so the groups pane is populated before any target is chosen.

**Layout & flow timing**
- D-09: The wide two-pane layout applies immediately after login, always. The login screen stays compact; the authenticated shell is permanently two-pane.
- D-10: Window: new authenticated default ~1280×800, minimum ~1080×680, freely resizable; panes use flex proportions 1/3 (left) : 2/3 (right).
- D-11: Left pane hosts the Phase 3 components relocated: TargetInput (idle) collapsing to one-line summary + TargetCard once resolved.
- D-12: Groups pane has two modes: **browse** (all admin groups + search/filter field, shown pre-target) and **checklist** (membership-verified, rights-aware, pre-checked rows for the confirmed target).

**Refresh & target-change semantics**
- D-13: "Change target" resets the groups pane to browse mode and clears the checklist; the membership scan starts automatically when the next target is confirmed.
- D-14: Dialog list freshness: fetched at login, cached for the session, with a manual refresh button in the groups pane. No automatic re-fetch per target or on interval.
- D-15: Membership scan always re-runs on every target confirm, even for the same target — no scan caching.

### Claude's Discretion
- Empty states (no groups at all, search-no-match), member-count formatting, exact progress-indicator styling, scroll/virtualization strategy for large lists, and scan pacing within governor constraints.
- Exact GramJS API mapping for per-chat-type rights detection.

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GRP-01 | App lists only the groups where the target is actually a member (membership verified per group) | `channels.GetParticipant` for supergroups/channels; full participant list scan for basic groups — see Membership Verification section |
| GRP-02 | Each listed group is shown as a checkbox pre-checked for removal (default = remove from all) | `@radix-ui/react-checkbox` + GroupsStore checked-set management |
| GRP-03 | User can uncheck groups to keep the target in selected groups | GroupsStore toggle action — uncheck removes from checked set |
| GRP-04 | Groups where the user lacks ban/kick rights are shown greyed-out with a specific reason | `dialog.entity.adminRights?.banUsers` (Channel/Supergroup) + `dialog.entity.creator` (basic group) — see Rights Detection section |
| GRP-05 | App detects group type (basic group vs supergroup vs channel) to determine removal capability and the correct grey-out reason | `dialog.entity instanceof Api.Chat` → basic group; `instanceof Api.Channel && megagroup` → supergroup; `instanceof Api.Channel && !megagroup` → broadcast channel — verified in GramJS source |
</phase_requirements>

---

## Summary

Phase 4 builds the group enumeration and membership-verification layer, wrapping up in the two-pane layout restructure. Three distinct concerns run in sequence: (1) dialog enumeration at login — fetch all admin-accessible groups/channels via `client.getDialogs()` and classify each by type and rights; (2) membership scan per confirmed target — for each group check whether the target is actually a member, streaming results to the renderer as they arrive; (3) layout restructure — widen the window, split the authenticated shell into a left (target) pane and right (groups) pane.

All the heavy GramJS API work lives in two main-process services: `GroupEnumerator` (dialog list at login, cached per session) and `MembershipScanner` (per-target scan, never cached). Both services inject the same shared `RateLimitGovernor` and use the `TargetResolver.getResolvedUser()` access-hash to call APIs that require a user-scoped input peer. The pattern mirrors `TargetResolver.ts` exactly — private state, `onStateChange` emitter, governor-wrapped calls, error classification.

The renderer side is a new `GroupsPane` component (browse mode + checklist mode) replacing the `StubbedWorkflowRegions` group-list stub, plus a `groupsStore` following the `useSyncExternalStore` pattern of `targetStore.ts`. A new `@radix-ui/react-checkbox` package is required; `@radix-ui/react-scroll-area` is recommended for the scrollable list. Both passed slopcheck `[OK]`.

**Primary recommendation:** Use `channels.GetParticipant` (not `getParticipants`) for per-user membership checks on supergroups/channels — it is a single targeted RPC call that throws `USER_NOT_PARTICIPANT` when not a member, which is exactly the signal needed. For basic groups, fall back to `messages.GetFullChat` participant list (basic groups are small, capped at ~200). Rights detection uses `dialog.entity.adminRights?.banUsers` for channels/supergroups, and `dialog.entity.creator` for basic groups (only creators can remove members from basic groups via `deleteChatUser`).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Dialog enumeration (which groups does the admin have?) | API / Main process | — | GramJS `client.getDialogs()` runs only in main; entity objects live only in main |
| Group type detection (Chat vs Channel vs supergroup) | API / Main process | — | Based on `dialog.entity instanceof Api.Chat/Channel` + `megagroup` flag, needs GramJS types |
| Admin rights detection | API / Main process | — | `dialog.entity.adminRights?.banUsers` + `creator` flag — GramJS entity fields |
| Membership verification per group | API / Main process | — | `channels.GetParticipant` / full chat participant list — GramJS network calls, governor-wrapped |
| Group state DTO / checked-set state | Renderer | Main (source of truth) | Main pushes typed DTOs; renderer holds checkbox toggle state locally |
| Two-pane layout | Renderer | — | CSS/Tailwind flex layout, no server involvement |
| Window size change | Main process | — | `BrowserWindow.setSize()` / constructor config in `src/main/index.ts` |
| Browse-mode search filter | Renderer | — | Client-side string filter over the cached DTO list |

---

## Standard Stack

### Core (no new packages required for main-process logic)

All GramJS APIs needed are in the already-installed `telegram@2.26.22`. No new main-process packages.

### New Renderer Packages Required

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@radix-ui/react-checkbox` | 1.3.4 (latest) | Accessible checkbox for the group-row pre-checked removal toggle | Matches existing Radix-UI pattern (all other interactive components already use `@radix-ui/*`) |
| `@radix-ui/react-scroll-area` | 1.2.11 (latest) | Scrollable container for potentially long group lists | Avoids native scrollbar inconsistencies across macOS/Windows; matches project UI component approach |

[VERIFIED: npm registry] — `@radix-ui/react-checkbox` 1.3.4, `@radix-ui/react-scroll-area` 1.2.11 confirmed via `npm view` and slopcheck `[OK]`.

**Installation:**
```bash
npm install @radix-ui/react-checkbox @radix-ui/react-scroll-area
```

**Version verification:**
```bash
npm view @radix-ui/react-checkbox version   # 1.3.4
npm view @radix-ui/react-scroll-area version # 1.2.11
```

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `@radix-ui/react-checkbox` | npm | ~5 yrs (Radix org) | very high (part of Radix ecosystem) | github.com/radix-ui/primitives | [OK] | Approved |
| `@radix-ui/react-scroll-area` | npm | ~5 yrs (Radix org) | very high (part of Radix ecosystem) | github.com/radix-ui/primitives | [OK] | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*Note: Both packages are part of the same `radix-ui/primitives` monorepo already used extensively in this project (`@radix-ui/react-avatar`, `@radix-ui/react-dialog`, etc.). Adding two more from the same org introduces no new supply-chain risk.*

---

## Architecture Patterns

### System Architecture Diagram

```
Login completes
      │
      ▼
GroupEnumerator.enumerateAtLogin()
  │  client.getDialogs() [paginated, governor-routed]
  │  → classify each dialog: type + adminRights
  │  → emit GroupsState { dialogs: AdminDialogDTO[] }
      │
      ▼
GroupsPane (browse mode)
  Renderer holds DTO list
  Browse search/filter field (Phase 4.1 reuse point)
      │
      │  Target confirmed (TargetResolver → 'confirmed')
      ▼
MembershipScanner.scan(targetId, targetAccessHash)
  │  For each dialog:
  │    governor.run(() => checkMembership(dialog, targetUser))
  │    → emit progress: { checked: N, total: M }
  │    → emit result: { dialogId, isMember: bool, error? }
      │
      ▼
GroupsPane (checklist mode)
  Verified-member rows: checkbox (pre-checked), actionable
  Non-member rows: not shown
  Failed rows: greyed, "couldn't verify — retry" + retry button
  Non-actionable rows: greyed, reason subtext + type badge
```

### Recommended Project Structure

```
src/
├── main/
│   └── telegram/
│       ├── GroupEnumerator.ts      # Dialog list + rights classification
│       └── MembershipScanner.ts   # Per-target membership check loop
├── main/
│   └── ipc/
│       └── groupChannels.ts       # Zod-validated IPC handlers (groups namespace)
├── shared/
│   ├── groupTypes.ts              # AdminDialogDTO, GroupsState, ScanProgress, GroupErrorCode
│   └── channels.ts                # New GROUP_* channel constants (augment)
├── renderer/
│   ├── ipc/
│   │   └── groupsClient.ts        # MrsProperApi augmentation for group methods
│   ├── store/
│   │   └── groupsStore.ts         # useSyncExternalStore pattern (mirrors targetStore.ts)
│   ├── components/ui/
│   │   ├── checkbox.tsx           # New shadcn-pattern Radix checkbox wrapper
│   │   └── scroll-area.tsx        # New shadcn-pattern scroll-area wrapper
│   └── groups/
│       ├── GroupsPane.tsx         # Browse + checklist modes
│       ├── GroupRow.tsx           # Single group row (actionable or greyed)
│       └── groupsCopy.ts          # All user-facing strings (i18n hygiene)
└── renderer/shell/
    └── AppShell.tsx               # Restructured to two-pane; StubbedWorkflowRegions removed
```

### Pattern 1: Dialog Enumeration with Type Classification

**What:** Fetch all dialogs from GramJS, filter to groups/channels (not DMs), classify by type, and extract admin rights.
**When to use:** Once at login; result cached for session.

```typescript
// Source: telegram@2.26.22 installed types + node_modules/telegram/tl/custom/dialog.d.ts

// dialog.isGroup: Chat OR (Channel && megagroup)
// dialog.isChannel: ANY Channel instance (including supergroups!)
// NOTE: isChannel && entity.megagroup → supergroup (has member removal)
//       isChannel && !entity.megagroup → broadcast channel (CANNOT remove members)
//       isGroup && entity instanceof Api.Chat → basic group

import { Api } from 'telegram'

function classifyDialog(dialog: Dialog): GroupType {
  const entity = dialog.entity
  if (!entity) return 'unknown'
  if (entity instanceof Api.Chat) return 'basic-group'
  if (entity instanceof Api.Channel) {
    return entity.megagroup ? 'supergroup' : 'broadcast-channel'
  }
  return 'unknown'
}

function getAdminRights(dialog: Dialog): AdminRightsInfo {
  const entity = dialog.entity
  if (entity instanceof Api.Chat) {
    // Basic group: only creator can remove members via deleteChatUser
    return { canBanUsers: entity.creator === true, reason: entity.creator ? null : 'not-creator' }
  }
  if (entity instanceof Api.Channel) {
    if (!entity.megagroup) {
      // Broadcast channel: members cannot be "removed" — no editorial access
      return { canBanUsers: false, reason: 'broadcast-channel' }
    }
    // Supergroup: check adminRights.banUsers
    const can = entity.adminRights?.banUsers === true
    return { canBanUsers: can, reason: can ? null : 'no-ban-right' }
  }
  return { canBanUsers: false, reason: 'not-admin' }
}
```

### Pattern 2: Membership Verification — Per-Group Approach

**What:** For a given target user, check membership in a specific supergroup/channel.
**When to use:** Per-group, during membership scan.

```typescript
// Source: telegram@2.26.22 installed types
// channels.GetParticipant returns channels.ChannelParticipant { participant, chats, users }
// Throws USER_NOT_PARTICIPANT (errorMessage) if user is not a member

// For supergroups/channels — single targeted call:
const result = await governor.run(() =>
  client.invoke(new Api.channels.GetParticipant({
    channel: inputChannel,   // InputPeerChannel
    participant: inputUser,  // InputPeerUser (built from targetId + accessHash)
  }))
) as { participant: Api.TypeChannelParticipant }
// result.participant is ChannelParticipant | ChannelParticipantSelf |
//   ChannelParticipantCreator | ChannelParticipantAdmin |
//   ChannelParticipantBanned | ChannelParticipantLeft
// ChannelParticipantLeft or ChannelParticipantBanned → not an active member
// ChannelParticipantBanned: check participant.bannedRights.viewMessages — if true, fully banned
```

### Pattern 3: Membership Verification — Basic Groups

**What:** Basic groups have no `channels.GetParticipant` equivalent — use full participant list from `messages.GetFullChat`.
**When to use:** Only for `Api.Chat` entity dialogs.

```typescript
// Source: node_modules/telegram/client/chats.js lines 154–174
// messages.GetFullChat returns fullChat.participants (ChatParticipants or ChatParticipantsForbidden)
// ChatParticipants.participants is an array of ChatParticipant shapes
// Basic groups are capped at ~200 members — safe to scan in-memory

const full = await governor.run(() =>
  client.invoke(new Api.messages.GetFullChat({ chatId: chatId }))
) as { fullChat: { participants: Api.TypeChatParticipants } }

if (full.fullChat.participants instanceof Api.ChatParticipants) {
  const participants = full.fullChat.participants.participants
  const isMember = participants.some(
    (p) => (p as { userId?: { toString(): string } }).userId?.toString() === targetIdStr
  )
}
// ChatParticipantsForbidden → you have no access to the participant list — treat as unverifiable
```

### Pattern 4: InputPeerUser Construction from TargetResolver

**What:** Build `Api.InputPeerUser` for the confirmed target, using the access hash from `TargetResolver.getResolvedUser()`. Access hash MUST come from the target's resolution result — it is NOT available in the renderer DTO.
**When to use:** MembershipScanner constructor receives the resolved user directly from the main-side `TargetResolver`.

```typescript
// Source: TargetResolver.ts:185-190 (getResolvedUser()) + api.d.ts InputPeerUser
import bigInt from 'big-integer'
import { Api } from 'telegram'

const resolved = resolver.getResolvedUser()  // { id: bigint, accessHash: bigint }
if (!resolved) throw new Error('No confirmed target')

const inputUser = new Api.InputPeerUser({
  userId: bigInt(resolved.id.toString()),
  accessHash: bigInt(resolved.accessHash.toString()),
})
```

### Pattern 5: InputPeerChannel from Dialog Entity

**What:** Build `Api.InputPeerChannel` for supergroup/channel dialogs using the dialog's `inputEntity` (already available on the Dialog object from `getDialogs()`).
**When to use:** Pass as `channel` parameter to `channels.GetParticipant`.

```typescript
// Source: telegram@2.26.22 dialog.d.ts — dialog.inputEntity is Api.TypeInputPeer
// For channels: dialog.inputEntity is already InputPeerChannel
// Safe to cast after type check on dialog.entity instanceof Api.Channel
const inputChannel = dialog.inputEntity  // Api.TypeInputPeer — use directly

await client.invoke(new Api.channels.GetParticipant({
  channel: inputChannel,
  participant: inputUser,
}))
```

### Pattern 6: DTO shape for the renderer

```typescript
// Source: project pattern — src/shared/targetTypes.ts as model
// NEW: src/shared/groupTypes.ts

export type GroupType = 'basic-group' | 'supergroup' | 'broadcast-channel'

export type GreyReason =
  | 'not-creator'          // Basic group: only creator can remove
  | 'no-ban-right'         // Supergroup: adminRights.banUsers is false
  | 'broadcast-channel'    // Broadcast channel: members cannot be removed
  | 'not-admin'            // Admin rights object absent entirely
  | 'verify-failed'        // MembershipScanner could not check this group

export interface AdminDialogDTO {
  /** bigint.toString() — serializable across IPC */
  id: string
  title: string
  /** Avatar bytes or null (group photo download) */
  avatar: Uint8Array | null
  /** Total member count from dialog or entity */
  memberCount: number | null
  type: GroupType
  /** True when the logged-in admin can perform a removal here */
  canAct: boolean
  /** Reason for canAct=false — shown as inline subtext */
  greyReason: GreyReason | null
}

export type MembershipStatus = 'pending' | 'member' | 'not-member' | 'failed'

export interface MembershipResultDTO {
  dialogId: string
  status: MembershipStatus
}

export type ScanProgressDTO = {
  checked: number
  total: number
}

// GroupsState discriminated union (push from main)
export type GroupsState =
  | { step: 'idle' }
  | { step: 'loading' }
  | { step: 'loaded'; dialogs: AdminDialogDTO[] }
  | { step: 'error'; code: GroupErrorCode }

export type ScanState =
  | { step: 'idle' }
  | { step: 'scanning'; progress: ScanProgressDTO; results: MembershipResultDTO[] }
  | { step: 'complete'; results: MembershipResultDTO[] }
  | { step: 'error'; code: GroupErrorCode }

export type GroupErrorCode =
  | 'FLOOD_WAIT'
  | 'NETWORK'
  | 'UNKNOWN'
```

### Pattern 7: IPC Channel Constants (augmentation)

```typescript
// Source: src/shared/channels.ts pattern

// Group enumeration channels (Phase 4)
export const GROUPS_GET_STATE = 'groups:getState' as const
export const GROUPS_STATE = 'groups:state' as const          // push
export const GROUPS_REFRESH = 'groups:refresh' as const

// Membership scan channels (Phase 4)
export const SCAN_START = 'scan:start' as const
export const SCAN_ABORT = 'scan:abort' as const
export const SCAN_RETRY_GROUP = 'scan:retryGroup' as const
export const SCAN_STATE = 'scan:state' as const             // push
export const SCAN_GET_STATE = 'scan:getState' as const
```

### Pattern 8: groupsClient MrsProperApi Augmentation

```typescript
// Source: src/renderer/ipc/targetClient.ts augmentation pattern

declare global {
  interface MrsProperApi {
    getGroupsState(): Promise<GroupsState>
    refreshGroups(): Promise<GroupsState>
    onGroupsState(cb: (s: GroupsState) => void): () => void
    startScan(): Promise<ScanState>
    abortScan(): Promise<void>
    retryScanGroup(dialogId: string): Promise<void>
    getScanState(): Promise<ScanState>
    onScanState(cb: (s: ScanState) => void): () => void
  }
}
```

### Anti-Patterns to Avoid

- **Using `client.getEntity()` instead of `client.invoke(new Api.channels.GetParticipant(...))`**: `getEntity` wraps errors and defeats the RPCError classifier. Use direct `invoke()` for all membership checks so `USER_NOT_PARTICIPANT` surfaces with its exact `errorMessage`.
- **Treating `ChannelParticipantLeft` or `ChannelParticipantBanned` as "is a member"**: The `channels.GetParticipant` call returns these subtypes without throwing; the service must inspect the participant subtype and treat Left/Banned as non-member.
- **Running dialog enumeration through `getDialogs()` inside `governor.run()`**: `getDialogs()` is a high-level method that internally calls multiple RPCs and handles pagination. Wrap the per-RPC calls by using `iterDialogs` and wrapping per-batch invocations, OR call `getDialogs({limit: N})` and accept that the governor's concurrency-1 serialization will hold the tail chain for its entire duration. For Dialog enumeration (read-only, done once at login), calling `getDialogs()` in a single governor slot is acceptable. Document the trade-off.
- **Fetching group avatars at enumeration time**: Group avatar downloads are optional cosmetic data. Defer or batch after the list is visible. A null avatar should show initials, not block enumeration.
- **Assuming broadcast channel members can be "kicked"**: They cannot. `channels.EditBanned` on a broadcast channel where the user is a subscriber returns success silently but has no effect on membership. The correct grey-out reason for broadcast channels is "Channel — members can't be removed", and these should never appear as actionable.
- **Sharing scan state across target changes**: Decision D-15 mandates a fresh scan per target confirm. The scanner service must reset on every `scan.start()` call, regardless of whether the same target is re-confirmed.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Accessible checkbox component | Custom div + click handler | `@radix-ui/react-checkbox` wrapped in `checkbox.tsx` (shadcn pattern) | Keyboard, ARIA, indeterminate state, all handled; matches project component pattern |
| Scrollable list container | `overflow-y: auto` on a raw div | `@radix-ui/react-scroll-area` wrapped in `scroll-area.tsx` | Cross-platform consistent scrollbar styling on macOS/Windows — Electron exposes the OS scrollbar, which looks different; Radix normalizes this |
| Membership check for supergroups | Fetching full participant list | `channels.GetParticipant` (single targeted RPC) | Full participant list for large supergroups (10k+ members) is hundreds of paginated calls; single-lookup is O(1) calls |
| Type guard for Group vs Supergroup | Checking `dialog.isGroup` alone | Check `instanceof Api.Chat` (basic group) vs `instanceof Api.Channel` + `megagroup` (supergroup) | `dialog.isGroup` is true for BOTH basic groups and supergroups; `isChannel` is true for ALL Channels including supergroups. The `instanceof` approach on `dialog.entity` is the reliable discriminator |

**Key insight:** The GramJS `Dialog` custom type's `isChannel`/`isGroup` flags are designed for "is it a channel-ish thing" not "is it a broadcast channel specifically". The only reliable way to detect broadcast-channel vs supergroup is checking `entity instanceof Api.Channel && entity.megagroup`.

---

## Common Pitfalls

### Pitfall 1: channels.GetParticipant returns ChannelParticipantLeft/Banned without throwing
**What goes wrong:** You call `channels.GetParticipant` expecting an error if the user isn't a member. Telegram returns a `ChannelParticipantLeft` or `ChannelParticipantBanned` participant object with no error — the user shows up as a member.
**Why it happens:** Telegram distinguishes "recently left" and "banned" participants from "never was a member". Only if the user was never in the channel does `USER_NOT_PARTICIPANT` throw.
**How to avoid:** After a successful `GetParticipant` call, inspect the participant subtype. Treat `ChannelParticipantLeft` and `ChannelParticipantBanned` (with full ban rights set) as non-member for Phase 4's purposes. Phase 5 removal logic also needs this distinction.
**Warning signs:** Test with a user who left the group — they appear in membership scan results incorrectly.

### Pitfall 2: getDialogs() blocks the governor tail-chain for its full duration
**What goes wrong:** `client.getDialogs()` internally paginates across multiple `messages.GetDialogs` RPCs. Wrapping the entire call in a single `governor.run()` works but holds the tail chain for all those network round-trips, blocking any other governed call (e.g., ongoing target resolution) for seconds.
**Why it happens:** The governor uses a serial tail-chain (`_tail`). One long-running slot starves everything else.
**How to avoid:** For dialog enumeration at login (D-08), this is acceptable because it happens before any other operation. Add a comment in the code documenting this trade-off. If FLOOD_WAIT occurs mid-enumeration, the governor will sleep and resume.
**Warning signs:** The app appears to hang briefly after login before the groups pane populates; FLOOD_WAIT during enumeration pauses all other Telegram calls.

### Pitfall 3: CR-02 — GramJS `long` fields are big-integer objects, not native bigint
**What goes wrong:** Comparing `dialog.entity.id === targetId` or `typeof entity.id === 'bigint'` fails silently. Dialog IDs from GramJS are `big-integer` library objects. Comparing with `===` always returns false.
**Why it happens:** GramJS deserializes `long` TL fields as `big-integer` library objects (NOT native JS bigint). This is established as CR-02 in the codebase.
**How to avoid:** Always compare via `.toString()` equality: `entity.id.toString() === targetIdStr`. Use `bigInt(x.toString())` when constructing GramJS input peers from stored bigint values.
**Warning signs:** Membership check always returns "not a member" even for known members; group list filter produces empty results.

### Pitfall 4: Basic group creator detection is fragile
**What goes wrong:** You check `entity.adminRights?.banUsers` for a basic group (`Api.Chat`) and always get `undefined`, so every basic group appears non-actionable.
**Why it happens:** `Api.Chat` does not have per-action `adminRights.banUsers` for the `creator` role. The `creator` boolean on the Chat object is the correct signal — only group creators can remove members via `deleteChatUser`.
**How to avoid:** For `Api.Chat` entities, check `entity.creator === true` (not `adminRights`). For `Api.Channel` entities, check `entity.adminRights?.banUsers === true`.
**Warning signs:** All basic groups show as non-actionable even when the logged-in user created the group.

### Pitfall 5: Broadcast channel avatar download is unsupported via downloadProfilePhoto
**What goes wrong:** `client.downloadProfilePhoto(entity)` for a channel entity returns `null` or throws, blocking the dialog enumeration.
**Why it happens:** `downloadProfilePhoto` works for users and some entities; for channels it may return undefined or need special handling. The `Dialog` object's entity may have a `ChatPhoto` object but downloading it requires `upload.GetFile` with the correct DC routing.
**How to avoid:** Wrap all avatar downloads in a try/catch and treat any failure as null (same graceful-degradation pattern as TargetResolver._fetchAvatar). Show initials fallback for groups using the group title's first character.
**Warning signs:** Dialog enumeration hangs or errors on groups with avatars.

### Pitfall 6: IPC push event while window is being destroyed (macOS re-activation)
**What goes wrong:** `GroupEnumerator` emits a state update after `win.isDestroyed()` returns true (race between window close and async governor completion), causing an unhandled exception.
**Why it happens:** Established pattern — already handled in `emitTargetState` via `win.isDestroyed()` guard.
**How to avoid:** All `win.webContents.send(...)` calls in `emitGroupsState` and `emitScanState` MUST check `!win.isDestroyed()` first. Mirror the pattern from `emitTargetState` in `src/main/ipc/targetChannels.ts:96-100`.

---

## Code Examples

### Group Type Discrimination (verified against installed GramJS source)

```typescript
// Source: node_modules/telegram/tl/custom/dialog.js:33-36
// dialog.isGroup = Chat OR (Channel && megagroup)
// dialog.isChannel = ANY Channel instance

import { Api } from 'telegram'

// From a Dialog object's entity:
function getGroupLabel(dialog: Dialog): string {
  const e = dialog.entity
  if (e instanceof Api.Chat) return 'basic-group'
  if (e instanceof Api.Channel && e.megagroup) return 'supergroup'
  if (e instanceof Api.Channel && !e.megagroup) return 'broadcast-channel'
  return 'unknown'
}
```

### Admin Rights Detection (verified against api.d.ts)

```typescript
// Source: telegram@2.26.22 api.d.ts
// Api.Chat: creator?: boolean, adminRights?: ChatAdminRights
// Api.Channel: adminRights?: ChatAdminRights (banUsers?: boolean)
// ChatAdminRights: banUsers?: boolean (line 11389 in api.d.ts)

function canAdminRemoveFromGroup(entity: Api.Chat | Api.Channel): boolean {
  if (entity instanceof Api.Chat) {
    // Only the group creator can remove via deleteChatUser
    return entity.creator === true
  }
  if (entity instanceof Api.Channel) {
    if (!entity.megagroup) return false  // broadcast channel — never actionable
    return entity.adminRights?.banUsers === true
  }
  return false
}
```

### channels.GetParticipant — Single User Membership Check

```typescript
// Source: telegram@2.26.22 api.d.ts lines 27086-27097
// channels.GetParticipant({ channel, participant }) → channels.ChannelParticipant
// TypeChannelParticipant = ChannelParticipant | ChannelParticipantSelf |
//   ChannelParticipantCreator | ChannelParticipantAdmin |
//   ChannelParticipantBanned | ChannelParticipantLeft

async function checkMembershipChannel(
  client: TelegramClient,
  governor: RateLimitGovernor,
  inputChannel: Api.TypeInputPeer,
  inputUser: Api.InputPeerUser
): Promise<boolean> {
  const result = await governor.run(() =>
    client.invoke(new Api.channels.GetParticipant({
      channel: inputChannel,
      participant: inputUser,
    }))
  ) as { participant: Api.TypeChannelParticipant }

  const p = result.participant
  // ChannelParticipantLeft/Banned → not an active member
  if (p instanceof Api.ChannelParticipantLeft) return false
  if (p instanceof Api.ChannelParticipantBanned) return false
  return true
  // Throws errorMessage 'USER_NOT_PARTICIPANT' if user was never in the channel
}
```

### Basic Group Membership Check

```typescript
// Source: node_modules/telegram/client/chats.js lines 158-166
// messages.GetFullChat.fullChat.participants is ChatParticipants or ChatParticipantsForbidden

async function checkMembershipBasicGroup(
  client: TelegramClient,
  governor: RateLimitGovernor,
  chatId: bigint,
  targetIdStr: string
): Promise<boolean> {
  const full = await governor.run(() =>
    client.invoke(new Api.messages.GetFullChat({ chatId: bigInt(chatId.toString()) }))
  ) as { fullChat: Api.TypeChatFull }

  if (full.fullChat instanceof Api.ChatParticipantsForbidden) {
    throw Object.assign(new Error('CHAT_ADMIN_REQUIRED'), { errorMessage: 'CHAT_ADMIN_REQUIRED' })
  }
  if (full.fullChat instanceof Api.ChatFull) {
    const ps = full.fullChat.participants
    if (ps instanceof Api.ChatParticipants) {
      return ps.participants.some(
        (p) => (p as { userId?: { toString(): string } }).userId?.toString() === targetIdStr
      )
    }
  }
  return false
}
```

### Window Resize in main/index.ts

```typescript
// Source: src/main/index.ts lines 22-32 (existing window creation pattern)
// D-10: authenticated default 1280×800, min 1080×680

const mainWindow = new BrowserWindow({
  width: 1280,       // was 480
  height: 800,       // was 720
  minWidth: 1080,    // was 400
  minHeight: 680,    // was 600
  // ... rest unchanged
})
```

### Two-Pane AppShell (Tailwind flex layout)

```tsx
// Source: D-10 decisions + existing AppShell.tsx pattern
// flex-1 content area splits: left pane = flex-[1] (33%), right pane = flex-[2] (66%)

export default function AppShell({ identity }: AppShellProps) {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="bg-secondary border-b border-border px-4 py-2 flex items-center justify-between shrink-0">
        <IdentityDisplay identity={identity} />
        <SettingsMenu />
      </header>
      <main className="flex flex-1 overflow-hidden">
        {/* Left pane: 1/3 */}
        <div className="flex flex-col flex-[1] min-w-0 border-r border-border overflow-y-auto p-4">
          <TargetInput />
          <TargetCard />
        </div>
        {/* Right pane: 2/3 */}
        <div className="flex flex-col flex-[2] min-w-0 overflow-hidden">
          <GroupsPane />
        </div>
      </main>
    </div>
  )
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `client.getEntity()` for all lookups | Direct `client.invoke(new Api.*)` for anything needing exact error codes | Phase 3 (CR-02 lesson) | `getEntity` wraps errors and defeats `classifyRpcError`; direct invoke preserves `errorMessage` |
| Telethon / Python sidecar | GramJS in-process in Electron main | Phase 1 stack decision | All API types available in-process; no sidecar IPC; `downloadProfilePhoto` works natively |
| `instanceof bigint` checks | `.toString()` equality comparison | Phase 3 (CR-02) | GramJS `long` fields are big-integer lib objects, never native bigint |

**Deprecated/outdated:**
- `client.getEntity(username)` for resolution: confirmed out-of-scope per Phase 3 pattern; use `client.invoke(new Api.contacts.*)` directly.
- Phase 1's 480×720 window: replaced by D-10's 1280×800 two-pane layout in this phase.

---

## Assumptions Log

> All material claims in this research were verified against the installed `telegram@2.26.22` type declarations and runtime source in `node_modules/telegram/`. The following items are tagged `[ASSUMED]` and require confirmation.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `channels.GetParticipant` throws `USER_NOT_PARTICIPANT` (errorMessage) when the user was never in the group | Membership Verification — Pattern 2 | If it silently returns an empty result instead, the non-member detection logic breaks; scanner might claim user is a member incorrectly |
| A2 | `ChannelParticipantBanned` with full ban rights set indicates the user is no longer an active member for Phase 4 purposes | Pattern 2 / Pitfall 1 | If partially-banned users (view-only restriction) should still count as "members" for removal, the return-false-for-Banned logic needs a flag check on `bannedRights.viewMessages` |
| A3 | `Api.Chat.creator` is the correct signal for basic-group removal capability (not `adminRights.banUsers`) | Pattern 1 / Pitfall 4 | If non-creator admins can also call `deleteChatUser` on a basic group, the non-actionable detection would over-restrict |

**Empirical validation recommended:** Test A1 and A3 with a real throwaway account + test groups during Phase 5 development (noted as a blockers/concern in STATE.md).

---

## Open Questions

1. **Does `channels.GetParticipant` throw `USER_NOT_PARTICIPANT` or return a `ChannelParticipantLeft`-equivalent for users who were never members?**
   - What we know: Telegram docs say USER_NOT_PARTICIPANT is returned; GramJS source uses the same error string; Pitfall 1 documents that recently-left users return a ChannelParticipantLeft without error
   - What's unclear: The exact behavior for users who were never in the group vs users who left recently
   - Recommendation: Add a test case in the MembershipScanner service for both scenarios; handle both USER_NOT_PARTICIPANT error AND ChannelParticipantLeft return value as "not a member"

2. **Can non-creator admins remove members from basic groups?**
   - What we know: `Api.Chat` has `adminRights?: ChatAdminRights` which includes `banUsers`. If an admin was promoted, they may have ban rights even without `creator = true`
   - What's unclear: Whether `messages.DeleteChatUser` works for a non-creator promoted admin
   - Recommendation: Check `entity.adminRights?.banUsers === true` as an additional condition alongside `entity.creator` for basic groups. Use OR logic: `canAct = entity.creator || entity.adminRights?.banUsers === true`

3. **Should the dialog list include archived groups?**
   - What we know: `getDialogs()` without `folder` param includes all dialogs (archived + non-archived). D-08 says "dialog list fetched eagerly at login, cached for session"
   - What's unclear: Whether admins expect to see archived groups in the removal target list
   - Recommendation: Decide at planning time — default to `ignoreMigrated: true` to skip promoted basic groups (which became supergroups and show up twice); include archived groups by default since admins may have legitimate archived communities

---

## Environment Availability

This phase is purely code/config changes against already-installed Node.js, Electron, and GramJS. External dependencies are already verified from prior phases.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | GramJS in main process | ✓ | 22.x (Electron-bundled) | — |
| `telegram` (GramJS) | All Telegram API calls | ✓ | 2.26.22 | — |
| Electron | Window resize, IPC, safeStorage | ✓ | 42.4.0 | — |
| `@radix-ui/react-checkbox` | Group row checkbox | ✗ — needs install | 1.3.4 (latest) | — |
| `@radix-ui/react-scroll-area` | Groups pane scroll | ✗ — needs install | 1.2.11 (latest) | Use overflow-y-auto on a plain div (acceptable fallback) |

**Missing dependencies with no fallback:**
- `@radix-ui/react-checkbox` — required for GRP-02/GRP-03; no acceptable substitute without building a custom accessible checkbox

**Missing dependencies with fallback:**
- `@radix-ui/react-scroll-area` — plain `overflow-y-auto` div works as a functional fallback; cosmetic difference in scrollbar styling

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.8 |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npm test` |
| Full suite command | `npm test` |
| Test env | `node` (no DOM — all tests target main-process logic) |

**Note:** The existing vitest config targets `environment: 'node'` and `include: ['src/**/*.test.ts']`. Renderer component tests (React) are currently NOT in scope for this project's test suite (no jsdom/happy-dom installed, no `@testing-library/react`). Phase 4 tests will cover main-process services only.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GRP-01 | `MembershipScanner` returns only verified-member groups | unit | `npm test -- --reporter=verbose` | ❌ Wave 0: `src/main/telegram/membershipScanner.test.ts` |
| GRP-01 | `channels.GetParticipant` USER_NOT_PARTICIPANT → not-member result | unit | `npm test` | ❌ Wave 0 |
| GRP-01 | Basic group membership via `messages.GetFullChat` participant list | unit | `npm test` | ❌ Wave 0 |
| GRP-04 | Rights detection: supergroup without banUsers → canAct=false | unit | `npm test` | ❌ Wave 0: `src/main/telegram/groupEnumerator.test.ts` |
| GRP-04 | Rights detection: basic group non-creator → canAct=false | unit | `npm test` | ❌ Wave 0 |
| GRP-05 | Type detection: `Api.Chat` → 'basic-group' | unit | `npm test` | ❌ Wave 0 |
| GRP-05 | Type detection: `Api.Channel` megagroup=true → 'supergroup' | unit | `npm test` | ❌ Wave 0 |
| GRP-05 | Type detection: `Api.Channel` megagroup=false → 'broadcast-channel' | unit | `npm test` | ❌ Wave 0 |
| GRP-02/03 | IPC handler: scan:start triggers scan; groups:getState returns dialogs | unit | `npm test` | ❌ Wave 0: `src/main/ipc/groupChannels.test.ts` |

### Sampling Rate

- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/main/telegram/groupEnumerator.test.ts` — covers group type detection + rights detection (GRP-04, GRP-05)
- [ ] `src/main/telegram/membershipScanner.test.ts` — covers membership verification (GRP-01)
- [ ] `src/main/ipc/groupChannels.test.ts` — covers IPC handler Zod validation + state push
- [ ] Mock client extensions in `src/main/telegram/__mocks__/telegramClient.ts` — add `getDialogs`, `channels.GetParticipant`, `messages.GetFullChat` mock controls

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Session already established in Phase 1 |
| V3 Session Management | no | No session changes in this phase |
| V4 Access Control | yes | Groups displayed only come from the admin's own dialogs; MembershipScanner acts on the target's resolver-provided accessHash — never renderer-provided |
| V5 Input Validation | yes | Zod schema for all inbound IPC payloads (dialogId in scan:retryGroup must be a string matching the known dialog list) |
| V6 Cryptography | no | No new crypto in this phase |

### Known Threat Patterns for This Phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Renderer injects arbitrary dialogId for membership check or retry | Tampering | IPC handler validates dialogId against the in-memory known dialog list in `GroupEnumerator`; unknown IDs are rejected before any API call |
| accessHash crossing IPC to renderer | Info Disclosure | `AdminDialogDTO` has NO accessHash field by construction (mirrors T-03-01 for channels); accessHash stays in main's `GroupEnumerator` internal map |
| Renderer-provided targetId used for membership check | Tampering | `MembershipScanner` reads target from `TargetResolver.getResolvedUser()` in main — NOT from any renderer-supplied payload; scan:start carries no target data |
| State push to destroyed window (macOS re-activation) | DoS | All `win.webContents.send()` gated behind `!win.isDestroyed()` check (Pitfall 6) |

---

## Sources

### Primary (HIGH confidence)

- `node_modules/telegram/tl/api.d.ts` — `Api.channels.GetParticipant`, `Api.channels.EditBanned`, `Api.Chat`, `Api.Channel` (megagroup flag, adminRights, creator), `Api.ChatAdminRights.banUsers`, `TypeChannelParticipant` union, `channels.ChannelParticipant` response shape — verified by direct file read
- `node_modules/telegram/tl/custom/dialog.d.ts` — `Dialog.isGroup`, `Dialog.isChannel`, `Dialog.entity`, `Dialog.inputEntity` — verified by direct file read
- `node_modules/telegram/tl/custom/dialog.js:33-36` — confirmed `isGroup = Chat || (Channel && megagroup)`, `isChannel = Channel` — verified by direct file read
- `node_modules/telegram/client/dialogs.d.ts` — `IterDialogsParams`, `getDialogs()` signature — verified by direct file read
- `node_modules/telegram/client/chats.js:91-175` — `_ParticipantsIter._init()` showing basic group uses `messages.GetFullChat`, channel uses `channels.GetParticipants` — verified by direct file read
- `node_modules/telegram/Helpers.js:443-478` — `_EntityType` enum (USER=0, CHAT=1, CHANNEL=2) and `_entityType()` function — verified by direct file read
- `src/main/telegram/TargetResolver.ts` — established `getResolvedUser()` contract; accessHash provenance — verified by direct file read
- `src/main/telegram/governor.ts` — governor pattern; concurrency-1 tail-chain — verified by direct file read
- `src/main/index.ts` — single shared governor; window dimensions; IPC registration pattern — verified by direct file read
- `src/main/ipc/targetChannels.ts` — IPC handler pattern with Zod validation — verified by direct file read
- `src/renderer/store/targetStore.ts` — `useSyncExternalStore` pattern to mirror — verified by direct file read
- `src/renderer/ipc/targetClient.ts` — `MrsProperApi` augmentation pattern — verified by direct file read

### Secondary (MEDIUM confidence)

- GramJS official documentation at gram.js.org/tl/channels/GetParticipant — describes USER_NOT_PARTICIPANT error; not directly fetched in this session, behavior inferred from GramJS installed source + Telegram MTProto documented behavior [ASSUMED: A1]

---

## Metadata

**Confidence breakdown:**
- Standard stack (GramJS API mapping): HIGH — verified against installed types and source
- Architecture (service pattern): HIGH — derived from existing TargetResolver/governor pattern in codebase
- UI layout: MEDIUM — Tailwind flex proportions are standard; exact pixel overflow behavior depends on OS
- Rights detection: HIGH for supergroups (banUsers field verified); MEDIUM for basic groups (creator flag logic — see A3)
- Membership check via GetParticipant: HIGH that the API exists and takes these params; MEDIUM on exact error behavior (A1, A2)

**Research date:** 2026-06-11
**Valid until:** 2026-09-11 (GramJS 2.26.22 is pinned; stable until major version bump)

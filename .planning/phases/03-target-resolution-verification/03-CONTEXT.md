# Phase 3: Target Resolution & Verification - Context

**Gathered:** 2026-06-11
**Status:** Ready for planning

<domain>
## Phase Boundary

A user can specify a target by username or phone number, have it resolved exactly once to a stable numeric user ID + access_hash that is acted on thereafter, and visually confirm it is the right person via avatar and identity details — with honest, cause-specific handling when resolution fails or no avatar exists. Covers TGT-01..04 and VRF-01..03. Group enumeration (Phase 4), removal (Phases 5–6) are downstream consumers of the confirmed target.

</domain>

<decisions>
## Implementation Decisions

### Target input design
- **D-01:** **Smart single field** — one input that auto-detects intent: starts with `@` or contains letters → username; starts with `+` or all digits → phone. A small detected-mode indicator shows how the input will be interpreted before the user submits.
- **D-02:** **Bare digits are accepted as phone** with a country guess (e.g., from system locale) shown as a **visible, changeable country chip**. International `+` input bypasses the guess. (The Phase 1 `CountryPicker` component is the natural asset for the chip's picker.)
- **D-03:** **Resolution fires only on explicit action** — Find button or Enter. No debounced auto-lookup; each attempt is one deliberate governor-routed API call (ResolveUsername FLOOD_WAITs aggressively).
- **D-04:** **Pasted Telegram links are normalized** — strip `t.me/`, `https://t.me/`, leading `@`, and `t.me/+<phone>` forms so paste-and-go works.
- **D-05:** **No target history in v1** — a removal tool storing past targets is sensitive; each session starts clean. (Deliberate reversal of the "target history via electron-store" idea in the tech-stack notes.)
- **D-06:** **No numeric-ID input in v1** — digits always mean phone. Numeric-ID lookup is unreliable without an access_hash and isn't in requirements.

### Phone lookup contact side-effect
- **D-07:** Phone lookup uses the required `contacts.ImportContacts` mechanism, and the app **asks per lookup** whether to keep or remove the imported contact — the user decides each time.
- **D-08:** The keep-or-remove dialog appears **after successful resolution** ("Remove +420… from your contacts again?"). **Failed lookups auto-clean** the imported contact silently — no dialog.
- **D-09:** **Pre-existing contacts are never touched.** If the phone is already in the admin's contacts, resolve directly — no import, no dialog, and never offer deletion of a contact the app didn't create. The keep/remove flow applies ONLY to app-imported contacts.
- **D-10:** **Inline disclosure hint** near the field when phone mode is detected: phone lookup briefly adds the number to contacts (removable afterwards) and only works if the target's privacy settings allow it. No blocking modal.

### Identity card & confirmation
- **D-11:** **Explicit confirm gate** — the identity card has a "Yes, this is the person" button that unlocks the next step (group enumeration). This is the first of two deliberate gates (the Phase 6 final pre-removal review is the second).
- **D-12:** **No-avatar fallback = colored initials circle (Telegram-style) PLUS an explicit notice**: no photo available (privacy-hidden or not set), verify using the text details. Honest about reduced verification confidence; user can still proceed deliberately (VRF-03).
- **D-13:** Card shows the **required identity set (name, @username, numeric ID, bio) plus cheap distinguishing signals already present in the resolved User object**: last-seen status, premium badge, bot flag. No extra API calls for these.
- **D-14:** **"Change target" control resets the flow** — clears the confirmed target and all downstream state (e.g., Phase 4 group list), returning to the input. Exactly one active target at a time, always re-confirmable.

### Failure states & retry
- **D-15:** Failures render as **inline errors under the input field** (input stays editable for immediate correction) — consistent with the Phase 1 login error pattern (Phase 1 D-12).
- **D-16:** Messages are **cause-specific AND carry an actionable hint** (TGT-04): e.g., username not found → check spelling / it may have changed; phone not found → number not on Telegram or privacy blocks lookup, "if you know their @username, try that instead"; no public profile → explain what that means.
- **D-17:** **FLOOD_WAIT during lookup reuses the countdown pattern** — disabled Find button with live "try again in N s" countdown, driven by the governor's `flood-tick` events over the `OP_GOVERNOR_EVENT` channel. First operational consumer of the governor event stream; visually consistent with Phase 1's `FloodCountdown`.
- **D-18:** **Deleted accounts and bots are warned-but-allowed** — the card shows a "Deleted account" / "Bot" badge; confirmation is still possible (admins legitimately purge both from groups).

### Claude's Discretion
- Exact detected-mode indicator design, country-guess source (locale vs IP), card layout details, copy wording, where the resolution state lives in the store, IPC channel naming, and how resolved target state is exposed to Phase 4 — pick sensible defaults consistent with existing patterns. Surface anything load-bearing at planning time.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Prior phase contracts
- `.planning/phases/02-rate-limit-governor-error-classification/02-CONTEXT.md` — Governor is the mandatory chokepoint for ALL post-auth operational calls (D-05); operation error taxonomy and dispositions (D-04); extensibility contract for new error codes.
- `.planning/phases/01-foundation-auth-session-portable-shell/01-CONTEXT.md` — UI conventions (inline errors D-12, spinner-on-button D-09), app-shell stub regions this phase fills (D-10), IPC/preload security architecture (D-02).

### Implementation contracts in code
- `src/main/telegram/governor.ts` — `RateLimitGovernor.run()` entry point all resolution calls must use; GovernorEvent emission.
- `src/shared/opTypes.ts` — `GovernorEvent`, `OperationErrorCode`, `Disposition` types; events must carry only typed codes (no raw Telegram strings to renderer).
- `src/shared/channels.ts` — IPC channel constants pattern; `OP_GOVERNOR_EVENT` push channel already wired for flood-tick consumption.
- `src/main/telegram/SessionManager.ts` (`_fetchIdentity`, lines ~402–416) — existing avatar download + fallback pattern to replicate for target avatars.

[No external specs — remaining requirements fully captured in decisions above]

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/renderer/shell/IdentityDisplay.tsx` — renders avatar + name + @username for the logged-in account; direct analog for the target identity card.
- `src/renderer/components/ui/avatar.tsx` — avatar component with fallback slot (shadcn-style); use for initials fallback.
- `src/renderer/auth/CountryPicker.tsx` — flag + dial-code picker; reuse for the country chip on bare-digit phone input (D-02).
- `src/renderer/auth/FloodCountdown.tsx` — live countdown UI; visual reference for the lookup FLOOD_WAIT countdown (D-17).
- `src/renderer/shell/StubbedWorkflowRegions.tsx` — Phase 1's placeholder target-input region that this phase replaces with real UI.
- `src/main/telegram/__mocks__/telegramClient.ts` — `makeRPCError()` mock pattern with `MockRPCErrorCode` union; extend for resolution error codes (USERNAME_NOT_OCCUPIED, etc.).

### Established Patterns
- All Telegram calls via `this._governor.run(() => ...)` — Phase 2 verified 17/17 on this invariant; resolution calls MUST follow.
- IPC: channel constant in `channels.ts` → handler in `src/main/ipc/` → preload bridge → renderer client in `src/renderer/ipc/` → zustand store (`authStore.ts` as the model).
- Error classification: extend `operationErrors.ts` taxonomy (designed extensible per Phase 2 D-04) for resolution-specific codes mapping to `fail` dispositions with distinct causes.
- Renderer never sees raw Telegram errors — typed codes only, copy lives in renderer (`errorCopy.ts` pattern).

### Integration Points
- `SessionManager` (or a new sibling service) holds the resolved-target state in main; renderer gets typed snapshots over IPC.
- `OP_GOVERNOR_EVENT` channel already forwards governor events to renderer — the lookup countdown subscribes to it.
- Confirmed target (ID + access_hash) is the input contract for Phase 4's group enumeration.

</code_context>

<specifics>
## Specific Ideas

- The no-photo fallback should look like Telegram's own colored-initials avatars — familiar to every Telegram admin.
- The keep-or-remove contact dialog phrasing should make clear the import already happened and worked ("Remove +420… from your contacts again?").
- Phone-mode inline hint doubles as the privacy-limitation disclosure (works only if their settings allow lookup).

</specifics>

<deferred>
## Deferred Ideas

- **Recent-targets history** (electron-store) — deliberately excluded from v1 (D-05); revisit only if repeat-offender workflows demand it.
- **Numeric-ID / `id:` prefix input** — power-user lookup path; would need dialog-scan fallback. Out of v1 scope (D-06).
- **VRF-04 common-groups count** ("in 7 of your communities") — already tracked as a deferred requirement in REQUIREMENTS.md; naturally lands with Phase 4 enumeration data.

</deferred>

---

*Phase: 3-Target Resolution & Verification*
*Context gathered: 2026-06-11*

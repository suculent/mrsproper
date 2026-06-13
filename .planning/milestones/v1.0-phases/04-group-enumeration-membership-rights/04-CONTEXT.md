# Phase 4: Group Enumeration, Membership & Rights - Context

**Gathered:** 2026-06-11
**Status:** Ready for planning

<domain>
## Phase Boundary

For a confirmed target, the user sees a rights-aware checklist of only the groups where the target is actually a member — pre-checked for removal, with non-actionable groups greyed out and labeled by reason and group type. The phase also delivers the wide two-pane authenticated layout (target pane left third, groups pane right two-thirds) and the eager post-login group enumeration that Phase 4.1 name search will reuse.

</domain>

<decisions>
## Implementation Decisions

### Group list ordering & rows
- **D-01:** Actionable groups ALWAYS sort first; greyed (non-actionable) rows grouped below. Within each section the user can toggle sort: A–Z (default) or member count.
- **D-02:** Each row shows group avatar, name, member count, and the removal checkbox.
- **D-03:** Grey-out reason is an inline muted subtext under the group name — always visible, no hover required.
- **D-04:** Group-type badges (Group/Supergroup/Channel) appear ONLY on greyed rows, where type explains non-actionability. Actionable rows stay clean.

### Scan progress UX
- **D-05:** Membership-scan results stream in: verified-member groups appear one by one as each governor-paced check completes, with a progress indicator ("checked 12/47").
- **D-06:** The checklist is interactive during the scan — already-verified rows are immediately toggleable. Only the final remove action (Phase 5/6) requires scan completion.
- **D-07:** A failed per-group check shows the group greyed with "couldn't verify — retry" inline subtext and a per-row retry affordance. Failures are never silently dropped.
- **D-08:** The dialog (group) list is fetched eagerly right after login (paginated, governor-routed) so the groups pane is populated before any target is chosen.

### Layout & flow timing
- **D-09:** The wide two-pane layout applies immediately after login, always. The login screen stays compact; the authenticated shell is permanently two-pane.
- **D-10:** Window: new authenticated default ~1280×800, minimum ~1080×680, freely resizable; panes use flex proportions 1/3 (left) : 2/3 (right).
- **D-11:** Left pane hosts the Phase 3 components relocated: TargetInput (idle) collapsing to one-line summary + TargetCard once resolved.
- **D-12:** Groups pane has two modes: **browse** (all admin groups + search/filter field, shown pre-target — this list and search field feed Phase 4.1 name search) and **checklist** (membership-verified, rights-aware, pre-checked rows for the confirmed target).

### Refresh & target-change semantics
- **D-13:** "Change target" resets the groups pane to browse mode and clears the checklist; the membership scan starts automatically when the next target is confirmed. No stale per-target state survives a target change.
- **D-14:** Dialog list freshness: fetched at login, cached for the session, with a manual refresh button in the groups pane. No automatic re-fetch per target or on interval.
- **D-15:** Membership scan always re-runs on every target confirm, even for the same target — removal decisions always rest on fresh membership/rights data. No scan caching.

### Claude's Discretion
- Empty states (no groups at all, search-no-match), member-count formatting, exact progress-indicator styling, scroll/virtualization strategy for large lists, and scan pacing within governor constraints.
- Exact GramJS API mapping for per-chat-type rights detection (researcher will resolve — flagged MEDIUM confidence in STATE.md).

### Folded Todos
- **Default country Czechia (+420) in CountryPicker** (`.planning/todos/pending/2026-06-11-default-country-czechia.md`) — one-line `DEFAULT_COUNTRY` change in `src/renderer/auth/CountryPicker.tsx:60` from `US` to `CZ`; benefits both login phone step and TargetInput phone mode. Ride-along UI task.
- **Make country rows clickable in login-form CountryPicker** (`.planning/todos/pending/2026-06-11-country-picker-rows-clickable.md`) — cmdk double-filtering bug; likely fix is `shouldFilter={false}` on the `<Command>` root (component pre-filters manually while `value={country.code}` confuses cmdk's internal filter). Ride-along UI task.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase architecture & sequencing
- `.planning/ROADMAP.md` §Phase 4 + §Phase 4.1 — success criteria (incl. criterion 5: wide layout) and the Phase 4.1 architecture decision (group-scoped name search reuses Phase 4's enumerated group list)
- `.planning/REQUIREMENTS.md` — GRP-01..GRP-05

### Prior phase contracts to build on
- `.planning/phases/03-target-resolution-verification/03-CONTEXT.md` — target resolution decisions (confirm gate, accessHash boundary)
- `.planning/phases/03-target-resolution-verification/03-SECURITY.md` — verified threat model; T-03-01/T-03-05 (accessHash never crosses IPC) and T-03-11 (shared client/governor) constrain Phase 4's membership service design

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/main/telegram/governor.ts` (RateLimitGovernor) — single shared instance constructed in `src/main/index.ts`, injected via DI into SessionManager and TargetResolver; the new group/membership service MUST take the same instance
- `src/main/telegram/TargetResolver.ts` — service-class pattern to mirror (private state, onStateChange emitter, governor-wrapped calls, classified errors via `operationErrors.ts`)
- `src/main/ipc/targetChannels.ts` — Zod-validated IPC handler pattern; `src/shared/channels.ts` for channel constants
- `src/renderer/store/targetStore.ts` — `useSyncExternalStore` external-store pattern with ref-counted subscriptions
- `src/renderer/components/ui/badge.tsx` — Badge component (new-york/slate cva pattern) for greyed-row type badges
- `src/renderer/target/resolveCopy.ts` / `src/renderer/auth/errorCopy.ts` — copy-module pattern; ALL new user-facing strings go in a dedicated `*Copy.ts` module (i18n hygiene for Phase 8)
- `src/renderer/shell/StubbedWorkflowRegions.tsx` — contains the group-list stub region to replace; TargetInput/TargetCard live here and relocate into the left pane

### Established Patterns
- bigint IDs serialize via `.toString()` to renderer; `accessHash` never crosses IPC (TypeScript-enforced — DTO types have no such field)
- GramJS peer/user IDs are `big-integer` objects, NOT native bigint — compare via `.toString()` equality (CR-02 lesson); mock client returns `bigInt(...)` instances
- Direct `client.invoke(new Api....)` calls (never `getEntity`) to preserve `RPCError.errorMessage` for the classifier
- Preload bridge: single `contextBridge.exposeInMainWorld('mrsproper', ...)`; renderer types via `MrsProperApi` interface merging (authClient.ts declares, targetClient.ts augments — a new groupsClient.ts augments the same interface)
- Window/app naming: visible strings "Mrs. Proper", identifiers MrsProper/mrsproper/MRSPROPER_

### Integration Points
- `src/main/index.ts` — instantiate the new group service with the shared client + governor; register new IPC channels; window default/min size change lands here
- `src/preload/index.ts` — new bridge entries for group enumeration/membership channels
- `src/renderer/shell/AppShell.tsx` — two-pane layout restructure (identity header stays; content area splits 1/3 : 2/3)
- `src/renderer/auth/CountryPicker.tsx` — folded todos (CZ default at line 60, `shouldFilter` fix)

</code_context>

<specifics>
## Specific Ideas

- Progress indicator phrased as a count ("checked 12/47") rather than a bare spinner
- The browse-mode search field is the same UI that Phase 4.1 will extend with First+Last-Name participant search — design it as a filter input that 4.1 can repurpose, not a throwaway
- Greyed-row reason copy must be specific per cause ("You're not an admin here", "No ban right in this group", "Channel — members can't be removed", "Couldn't verify — retry"), following the cause-specific error copy standard set in Phase 3

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Phase 4.1 name search and Phase 8 i18n were referenced as consumers of this phase's work, both already on the roadmap.)

</deferred>

---

*Phase: 04-group-enumeration-membership-rights*
*Context gathered: 2026-06-11*

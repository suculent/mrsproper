# Phase 13: Add Rights & Scan Semantics (Foundation) - Context

**Gathered:** 2026-10-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Main-process foundation for Add mode: every enumerated dialog tells the renderer whether the target can be added there (`canAdd`) and, when not, why (a cause-specific add grey reason); the membership scan distinguishes a *banned* target from a *not-member* one so Add mode can plan an unban-first; and the dead layer-224 two-phase machinery is removed from the tag path now that the whole GramJS package speaks TL layer 229 (quick task 261003-jni). No renderer changes in this phase beyond the two folded country-picker todos. Requirements: ADD-02, ADD-03, ADD-04, TAG-07.

</domain>

<decisions>
## Implementation Decisions

### Ban-aware scan status
- **D-01:** Extend `MembershipStatus` with a distinct `banned` value. For supergroups/channels the scanner maps `ChannelParticipantBanned` with `left === true` → `banned` (kicked, not in the group, cannot rejoin), `ChannelParticipantBanned` with `left` unset/false → `member` (restricted but still a participant), `ChannelParticipantLeft` (and `USER_NOT_PARTICIPANT`) → `not-member`. Remove mode treats `banned` exactly like `not-member` (nothing shipped changes); Add mode treats it as "needs unban first". *Revised 2026-10-03 (code review CR-01): the original text had the `left` polarity inverted relative to the TL schema (`left: whether the user has left the group`). Live-account check of both `left` states completed 2026-10-03 (13-UAT.md tests 3–4): polarity confirmed.*
- **D-02:** A banned row is actionable in Add mode **only when the admin holds the ban right** in that group (the same right removal uses). Otherwise it is greyed with the `banned-no-unban-right` reason. No doomed runs.
- **D-03:** Unban-first applies to supergroups and channels only. Basic groups cannot reveal bans via `messages.GetFullChat`; they keep `member` / `not-member`, `messages.AddChatUser` is attempted directly in Phase 14, and a `USER_KICKED` refusal is reported there.

### canAdd rule
- **D-04:** `canAdd = creator || adminRights.inviteUsers === true || defaultBannedRights.inviteUsers !== true` (open permissions: any member may invite). Computed in `GroupEnumerator` only; the renderer never derives rights.
- **D-05:** The identical rule applies to basic groups (`Api.Chat` exposes the same `creator` / `adminRights` / `defaultBannedRights` fields). Migrated and deactivated basic-group husks stay filtered out as today.
- **D-06:** Broadcast channels are included: `canAdd` follows D-04, while `canAct` (removal) stays `false` with the existing `broadcast-channel` reason. A broadcast channel whose known `participantsCount` is ≥ 200 is greyed **up front** with the `channel-full` reason (Telegram refuses direct adds past 200 subscribers; the invite-link fallback in Phase 14 covers those).

### Add-mode grey reasons
- **D-07:** Groups the target is already in stay **visible, greyed, sorted below** actionable rows in Add mode (mirrors Remove mode's not-member rows), with the `already-member` reason.
- **D-08:** Four specific reason codes: `already-member`, `no-invite-right`, `channel-full`, `banned-no-unban-right`. Each gets its own English and Czech line in the groups i18n namespace (`greyReason` table), consistent in tone with the existing removal reasons.
- **D-09:** Claude drafts the English and Czech copy (formal vykání, short factual lines, e.g. "You don't have the invite right in this group" / "Nemáte právo přidávat členy v této skupině"); the user reviews it at UAT.

### TagExecutor cleanup (TAG-07)
- **D-10:** **Full consolidation.** Delete `src/main/telegram/tagClient.ts`, `tagApi.ts` and their tests. `TagExecutor` issues the generated `Api.messages.EditChatParticipantRank` on the **main client** through `governor.run()`. Remove the Phase A/B/C two-phase ordering, the `tagClientFactory` and `restoreMainClientLayer` options, the reconnect mutex, and every layer-224 comment; drop the corresponding wiring in `src/main/index.ts`.
- **D-11:** Remove the "unparseable `Updates` response counts as success" tolerance. At layer 229 the response parses; a parse failure is a real error and surfaces as an `UNKNOWN` per-group failure.
- **D-12:** Tag writes stay **unconditional** (one write per selected group) even though the existing `rank` is now readable. Behaviour is identical to v1.6; `tagExecutor.test.ts` is adapted to the single-client shape with the same behavioural assertions.

### Claude's Discretion
- Exact shape of the DTO extension (e.g. `canAdd: boolean` + `addGreyReason: AddGreyReason | null` on `AdminDialogDTO` vs. a nested rights object), the `AddGreyReason` type name, and whether the scan result type gains the `banned` value directly or via a widened union.
- Whether the scanner also checks the admin's own `bannedRights.inviteUsers` restriction on their participant record (recommended if cheap; otherwise the server error is handled in Phase 14).
- Internal decomposition of `GroupEnumerator._classifyDialog` to compute both `canAct` and `canAdd` without duplicating the rights parsing.

### Folded Todos
- **Default country Czechia (+420) in CountryPicker** — `.planning/todos/pending/2026-06-11-default-country-czechia.md`. `DEFAULT_COUNTRY` in `src/renderer/auth/CountryPicker.tsx` is hardcoded to `US`; change the default to Czechia (+420) for both the login phone step and phone-mode target input. Small renderer fix folded in at the user's request.
- **Make country rows clickable in CountryPicker** — `.planning/todos/pending/2026-06-11-country-picker-rows-clickable.md`. Rows in the country popover (`CountryPicker.tsx` ~lines 113–131) do not select a country on click; fix so clicking a row selects it (benefits login and target entry). Folded in at the user's request.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope
- `.planning/REQUIREMENTS.md` — ADD-02, ADD-03, ADD-04, TAG-07 definitions; v2 and out-of-scope boundaries
- `.planning/ROADMAP.md` §Phase 13 — goal and the four success criteria
- `.planning/PROJECT.md` §Current Milestone — locked user decisions for Add mode (mode switch, broadcast channels, unban-first, contact-add, links, DM, log)

### Prior design and decisions
- `docs/superpowers/specs/2026-06-20-member-tag-action-design.md` — original tag design; §4.3 (layer-224 connection) is now OBSOLETE and is what TAG-07 removes
- `.planning/milestones/v1.6-phases/11-tagexecutor/11-CONTEXT.md` — Phase 11 decisions; the "layer-224 connection guard" section is superseded, the per-group dispatch / outcome / throttle decisions still hold
- `.planning/milestones/v1.6-phases/10-shared-types-ipc-audit-wiring/10-CONTEXT.md` — parallel-module and security-boundary conventions (types, IPC payloads, job files) that the new add types must mirror
- `.planning/quick/261003-jni-move-gramjs-client-to-tl-layer-229-schem/261003-jni-SUMMARY.md` — what the layer-229 move changed (vendor schema, postinstall regeneration, layer-neutral tagClient, `tlLayer.test.ts` guard)

### Folded todos
- `.planning/todos/pending/2026-06-11-default-country-czechia.md`
- `.planning/todos/pending/2026-06-11-country-picker-rows-clickable.md`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/main/telegram/GroupEnumerator.ts` — `_classifyDialog` already parses `creator` and `adminRights.banUsers` per group type and emits `AdminDialogDTO`; `canAdd` is a sibling computation on the same entity fields (`adminRights.inviteUsers`, `defaultBannedRights.inviteUsers`, `participantsCount`).
- `src/main/telegram/MembershipScanner.ts` — `_checkMembership` already receives the `ChannelParticipant` className; the `banned` status is a one-branch change at the `ChannelParticipantBanned` check (keep `ChannelParticipantLeft` → not-member).
- `src/shared/groupTypes.ts` — `GreyReason`, `MembershipStatus`, `AdminDialogDTO`, `ScanState` are the single source of truth for both processes; extend here.
- `src/renderer/i18n/locales/{en,cs}/groups.json` — `greyReason` table to extend with the four add reasons.
- `src/main/telegram/tlLayer.test.ts` — regression guard proving `Api.messages.EditChatParticipantRank` exists with ctor `0xa00f32b0`; the consolidated TagExecutor can rely on it.
- `src/main/telegram/__mocks__/telegramClient.ts` — mock client with call recording; extend for `EditChatParticipantRank` so `tagExecutor.test.ts` can assert the main-client write.

### Established Patterns
- Rights and identity are computed in main only; DTOs crossing IPC carry no accessHash (T-04-01 / T-05-04-B).
- Generation-token guard, governor routing, PEER_FLOOD hard-stop and per-group checkpointing are shared by RemovalExecutor and TagExecutor; the consolidated TagExecutor keeps all of them.
- Renderer grey logic in `GroupRow.tsx` / `GroupsPane.tsx` keys off `canAct` + `membershipStatus`; Phase 15 will add the Add-mode branch keyed off `canAdd` + the new reason — Phase 13 only has to make the data available.

### Integration Points
- `src/main/index.ts` — TagExecutor wiring (`tagClientFactory`, `restoreMainClientLayer`) to delete; TagExecutor receives the main client + governor like RemovalExecutor.
- `src/main/ipc/groupChannels.ts` — unchanged channels; the richer `ScanState` flows through the existing `scan:state` push.
- `src/renderer/auth/CountryPicker.tsx` — folded todo fixes.

</code_context>

<specifics>
## Specific Ideas

- Keep the Remove-mode experience byte-for-byte: `banned` must render and sort exactly as `not-member` does today in Remove mode.
- Reason copy style: match the existing lines ("You don't have the ban right in this group" / "Nemáte právo k zákazu v této skupině").

</specifics>

<deferred>
## Deferred Ideas

- Skipping the tag write when the group already carries the identical tag (rank is readable at layer 229) — user chose unconditional writes for now; candidate for a later tag-polish phase alongside TAG-08/TAG-09.
- Keeping an "unparseable response" tolerance as defence in depth — rejected for this phase; the schema refresh step (`npm run tl:update`) is the intended mitigation.

</deferred>

---

*Phase: 13-add-rights-scan-semantics-foundation*
*Context gathered: 2026-10-03*

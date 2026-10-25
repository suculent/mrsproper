---
phase: 16
slug: close-gap-add-08-resume-path-and-add-02-empty-state
status: verified
threats_open: 0
asvs_level: 1
created: 2026-10-24
---

# Phase 16 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register authored at plan time (16-01..16-05 PLAN.md `<threat_model>` blocks). Verified against code at HEAD d7aae33 (includes review fixes d4e8501 WR-02, 15926e0 WR-03, 6c2e6ff WR-04, d49ba4c WR-01).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| renderer -> main (ADD_START) | Untrusted payload; Zod admits only `dialogIds` (min 1, max 500, items 1..30 chars); dialog-map gate | Group ids (non-secret) |
| disk -> main (userData/add-job.json) | Trusted file (hardcoded path, mode 0o600) supplies target identity on relaunch resume | targetId, targetAccessHash (sensitive, main-only) |
| main -> renderer (ADD_STATE / ADD_GET_JOB) | `AddState.dialogIds` added; job returned as `AddJobFileSafe` | Group ids, target id/name (display); never accessHash |
| main -> renderer (groups DTO) | `AdminDialogDTO.canUnban` boolean added | Rights-derived booleans only; raw adminRights/accessHash never cross |
| renderer -> main (LANGUAGE_SET) | Zod enum `en`/`cs`; feeds sync DM-language cache | Locale enum |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation / Evidence | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-16-01 | Information Disclosure | AddState.dialogIds / ADD_GET_JOB | mitigate | `AddState.dialogIds?: string[]` is the only new field, no identity (src/shared/addTypes.ts:89-120); `AddJobFileSafe = Omit<AddJobFile,'targetAccessHash'>` (src/shared/addTypes.ts:169); ADD_GET_JOB strips hash via destructure (src/main/ipc/addChannels.ts:229-237); executor `_emit` merges only `_jobDialogIds` (src/main/telegram/AddExecutor.ts:173-179); `targetAccessHash` only read at AddExecutor.ts:222-226 and written to job at :278/:330; no renderer reference (grep of AddResumeJobDialog.tsx, addStore.ts: none) | closed |
| T-16-02 | Spoofing | Target rebuilt from job file | mitigate | Rebuild gated on `resolved === null && params.resume === true && existing !== null && existing.status !== 'complete' && sameDialogIdSet(existing.dialogIds, params.dialogIds)` (src/main/telegram/AddExecutor.ts:210-217); identity sourced from resolver or job file only, `execute(params)` carries only `{dialogIds, resume}` (AddExecutor.ts:204); job path `join(app.getPath('userData'), 'add-job.json')` (src/main/storage/addAuditStore.ts:141,163-167), production store constructed with defaults (src/main/index.ts:350); write mode 0o600 (addAuditStore.ts:186) | closed |
| T-16-03 | Elevation of Privilege | `resume` flag | mitigate | `AddStartSchema = z.object({ dialogIds: ... })` — no `resume` key, unknown keys stripped by Zod (src/main/ipc/addChannels.ts:86-88,139); `resume` computed from `auditStore.readJob()` (addChannels.ts:173-174) and forwarded at :178 | closed |
| T-16-04 | Tampering | Corrupt accessHash/targetId in job file | mitigate | WR-02 `isIntString` (`typeof v === 'string' && /^-?\d+$/`) on both targetId and targetAccessHash, BigInt in try/catch -> `resolved = null` (src/main/telegram/AddExecutor.ts:221-233); null -> `_emitEarlyIdle()` + return before any API call (AddExecutor.ts:235-238, 990-1003) | closed |
| T-16-05 | Tampering | ADD_START dialog-map gate | accept | See Accepted Risks AR-16-01. Gate still present: src/main/ipc/addChannels.ts:156-168 | closed |
| T-16-06 | Tampering | languageChannels cache | mitigate | `LanguageSchema = z.object({ language: z.enum(['en','cs']) })` (src/main/ipc/languageChannels.ts:29); `_cachedLanguage = language` assigned only after `LanguageSchema.parse(payload)` (languageChannels.ts:103-106); launch warm reads from electron-store, typed `'en'\|'cs'\|null` (languageChannels.ts:55-72) | closed |
| T-16-07 | Tampering | DM template content | accept | See Accepted Risks AR-16-02 | closed |
| T-16-08 | Denial of Service | Change target during run | mitigate | `isAnyRunActive(removal, tag, add)` covers running/stopping for all three modes (src/renderer/store/runActivity.ts:5-12); TargetCard button `disabled={isRunActive}` + guarded onClick (src/renderer/target/TargetCard.tsx:117,287-294); GroupsPane checklist "Change target" `disabled={isRunActive}` with the same three-mode rule (src/renderer/groups/GroupsPane.tsx:191-194,836-846); mode switch disabled during any run (GroupsPane.tsx:853). Note: "X someone else" summary-band buttons (GroupsPane.tsx:469,640,778) are not separately gated but render only when that mode's run is complete/stopped and the mode switch is locked during runs | closed |
| T-16-09 | Information Disclosure | Docs edits | accept | See Accepted Risks AR-16-03 | closed |
| T-16-10 | Elevation of Privilege | `resume` flag (renderer side) | mitigate | Preload sends `ipcRenderer.invoke(ADD_START, { dialogIds })` (src/preload/index.ts:231-232); `addClient.startAdd(dialogIds: string[])` (src/renderer/ipc/addClient.ts:15,27-28); `addActions.startAdd(dialogIds)` (src/renderer/store/addStore.ts:125-127); callers pass ids only (ReviewScreen.tsx:273, AddResumeJobDialog.tsx:57, addStore.ts:181) | closed |
| T-16-11 | Tampering | Full dialog set on resume | mitigate | Zod `.min(1).max(500)` (src/main/ipc/addChannels.ts:87); dialog-map gate throws on unknown ids (addChannels.ts:156-168); executor continuation re-checks `existing.targetId === targetId && sameDialogIdSet(...)` (src/main/telegram/AddExecutor.ts:306-311); `sameDialogIdSet` (src/main/storage/addAuditStore.ts:282-284); resume sends full set via `getResumeDialogIds` (src/shared/addResume.ts:25-27) | closed |
| T-16-12 | Information Disclosure | AddJobFileSafe in renderer | accept | See Accepted Risks AR-16-04 | closed |
| T-16-13 | Information Disclosure | AdminDialogDTO.canUnban | mitigate | `canUnban: boolean` field (src/shared/groupTypes.ts:60-61); derived in main `_computeCanUnban` = `creator === true \|\| adminRights?.banUsers === true` (src/main/telegram/GroupEnumerator.ts:279-281); `_buildDTO` is an explicit field projection with no adminRights/accessHash (GroupEnumerator.ts:301-325); basic groups hardcode `false` (GroupEnumerator.ts:194) | closed |
| T-16-14 | Elevation of Privilege | Doomed unban attempts | mitigate | Shared predicate `dialog.canAdd && (status === 'not-member' \|\| (status === 'banned' && dialog.canUnban))` (src/renderer/groups/modeRules.ts:28-30); used by groupsStore (src/renderer/store/groupsStore.ts:83,203), GroupsPane partition (GroupsPane.tsx:165), computeAddGroups (src/renderer/wizard/addValidation.ts:44), addPaneState (addPaneState.ts:24); executor backstop `CHAT_ADMIN_REQUIRED -> failed ADD_NO_RIGHTS` (src/main/telegram/AddExecutor.ts:846-848) | closed |
| T-16-15 | Tampering | Renderer-forged dialogIds | accept | See Accepted Risks AR-16-05 | closed |
| T-16-16 | Elevation of Privilege | Greyed banned row selectable | mitigate | GroupRow derives `isActionable = isActionableForMode(...)` (src/renderer/groups/GroupRow.tsx:142); interactive checkbox with `onCheckedChange` only in the `if (isActionable)` branch (GroupRow.tsx:319-332), else `aria-disabled` fallback (GroupRow.tsx:334-340); no row-level toggle onClick; computeAddGroups re-filters with `membershipByDialogId.get(d.id) ?? null` so unscanned rows are excluded (WR-04, addValidation.ts:41-44) and ReviewScreen sends only `addGroupActions` ids (ReviewScreen.tsx:239,273) | closed |
| T-16-17 | Information Disclosure | Empty-state text with target name | accept | See Accepted Risks AR-16-06 | closed |
| T-16-18 | Tampering | ADD_START payload | accept | See Accepted Risks AR-16-07 | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-16-01 | T-16-05 | ADD_START dialog-map gate unchanged from T-14-15; the full resume set is validated against the current enumeration, and an unknown id is rejected (not silently dropped) to keep the sameDialogIdSet gate strict | Plan 16-01 threat model | 2026-10-24 |
| AR-16-02 | T-16-07 | DM template content: renderTemplate and the template Zod bound (T-14-07, T-15-04) are unchanged by this phase; only the default-language source moved to the validated cache | Plan 16-02 threat model | 2026-10-24 |
| AR-16-03 | T-16-09 | Documentation edits only; no secrets or credentials introduced | Plan 16-02 threat model | 2026-10-24 |
| AR-16-04 | T-16-12 | AddJobFileSafe projection (no targetAccessHash) unchanged from T-14-01; re-verified at addChannels.ts:229-237 | Plan 16-03 threat model | 2026-10-24 |
| AR-16-05 | T-16-15 | A compromised renderer could submit any enumerated group id; dialog-map gate limits ids to the admin's own enumeration and Telegram enforces rights server-side (executor maps CHAT_ADMIN_REQUIRED to ADD_NO_RIGHTS) | Plan 16-04 threat model | 2026-10-24 |
| AR-16-06 | T-16-17 | Target name already shown on the target card. Correction to plan rationale: i18next runs with `escapeValue: false` (src/renderer/i18n/index.ts:70); escaping is provided by React text-node rendering, and no `dangerouslySetInnerHTML` exists in src/renderer | Plan 16-05 threat model | 2026-10-24 |
| AR-16-07 | T-16-18 | ADD_START payload shape unchanged: `{ dialogIds }` only, Zod + dialog-map gate (T-14-15, T-14-20) | Plan 16-05 threat model | 2026-10-24 |

*Accepted risks do not resurface in future audit runs.*

---

## Unregistered Flags

None. No `## Threat Flags` section is present in 16-01..16-05 SUMMARY.md.

Informational (not blocking, ASVS L1):
- `sameDialogIdSet` (addAuditStore.ts:282-284) can return true for two multisets with the same length and distinct-set size but different duplicate distributions (for example `[a,a,b]` and `[a,b,b]`). Both inputs must still pass the dialog-map gate and the targetId check, so this does not let identity or groups be spoofed.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-24 | 18 | 18 | 0 | gsd-security-auditor (Claude) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-24

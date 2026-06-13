---
phase: 6
slug: ui-integration-wizard
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-12
---

# Phase 6 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| renderer → preload → main (SEVERITY_*) | getSeverity/setSeverity cross the contextBridge; only whitelisted methods exposed | `{ severity: 'kick' \| 'ban' }` — Zod-validated in main before store write |
| ReviewScreen confirm → removalActions.startRemoval | Renderer dispatches removal; all security gates live in the main-process REMOVAL_START handler (T-05-05 four-layer gate) | `{ severity, dialogIds }` |
| stage machine in AppShell | Pure renderer state (explicit useState); presentation layer only — no IPC, no security boundary | none |
| governor.onEvent → executor._handleGovernorEvent | Internal main-process event forwarding scoped by `_runActive`; no trust boundary crossing | GovernorEvent (typed codes + numbers) |
| ResumeJobDialog resume → setStage('run') | startRemoval is dispatched before onResume fires; main-process gates still apply to the dispatched call | job.severity + remaining dialogIds |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-06-01-01 | Tampering | SEVERITY_SET IPC channel | mitigate | `SeveritySchema = z.object({ severity: z.enum(['kick', 'ban']) })` — src/main/ipc/severityChannels.ts:30; `SeveritySchema.parse(payload)` runs at :72 before `store.set()` at :74 | closed |
| T-06-01-02 | Tampering | preload surface | accept | getSeverity/setSeverity forward only the severity enum — src/preload/index.ts:162-165; no auth tokens or session data on these channels; see AR-06-01 | closed |
| T-06-01-SC | Tampering | npm installs (plan 01) | mitigate | No install in plan 01 (channel constants only); electron-store install deferred to plan 02 with slopcheck [OK] — 06-RESEARCH.md §Package Legitimacy Audit (lines 122-126) | closed |
| T-06-02-01 | Tampering | SEVERITY_SET IPC handler | mitigate | `SeveritySchema.parse()` throws ZodError for any value outside `['kick','ban']` before the store is touched — severityChannels.ts:30, :71-74; renderer cannot inject arbitrary strings into electron-store | closed |
| T-06-02-02 | Elevation of Privilege | SEVERITY_GET/SET channels | accept | Severity is a non-secret preference toggle; the destructive action is gated by REMOVAL_START's four-layer gate (removalChannels.ts:92-127); see AR-06-02 | closed |
| T-06-02-03 | Information Disclosure | electron-store data | accept | Store schema is `{ severity: 'kick' \| 'ban' }` only — severityChannels.ts:36-42 (defaults `{ severity: 'ban' }`); safeStorage reserved for session credential per CLAUDE.md; see AR-06-03 | closed |
| T-06-02-04 | Tampering | floodWaitRemaining cross-feature flood events | mitigate | `private _runActive = false` — src/main/telegram/RemovalExecutor.ts:89; `_handleGovernorEvent` no-ops unless run active (`if (!this._runActive) return` — :114); set true at execute() start (:133), reset false on every terminal path; wired in src/main/index.ts:161-162 with the no-op isolation documented | closed |
| T-06-02-SC | Tampering | npm install electron-store | mitigate | slopcheck [OK] — Sindre Sorhus, created 2017 (8+ yrs), 06-RESEARCH.md:104-126; installed version 11.0.2 matches audited version; install commit f5d94a4 (feat(06-02)) | closed |
| T-06-03-01 | Elevation of Privilege | ReviewScreen confirm bypassed | accept | Real gate is main-process removalChannels.ts REMOVAL_START: Zod (:94) → auth (:97) → double-start guard (:104-107) → enumerator dialog-map (:111-120); ReviewScreen is additive UI safety; see AR-06-04 | closed |
| T-06-03-02 | Tampering | computePlannedActions mechanic derivation | accept | Pure function over renderer store data — src/renderer/wizard/ReviewScreen.tsx:69-92; no IPC; mechanic table (deleteChatUser / editBanned / restrict-then-unban) mirrors RemovalExecutor behavior; see AR-06-05 | closed |
| T-06-03-03 | Spoofing | Identity block rendering wrong user | accept | Identity read exclusively from `targetState.step === 'confirmed'` state — ReviewScreen.tsx:128-135; targetStore is fed by main-process resolver pushes (T-05-04-B lineage); see AR-06-06 | closed |
| T-06-03-SC | Tampering | npm installs (plan 03) | accept | No package.json commit in plan 03 — git log for package.json in phase 6 shows only f5d94a4 (06-02) and 1375c81 (06-05); see AR-06-07 | closed |
| T-06-04-01 | Elevation of Privilege | Wizard stage bypass | accept | REMOVAL_START handler enforces Zod + auth + double-start + dialog-map independent of UI stage (removalChannels.ts:92-127); stage machine is presentation only; see AR-06-04 | closed |
| T-06-04-02 | Tampering | Double-confirm gate (SAF-02) | mitigate | RemovalConfirmDialog.tsx absent from src/renderer/removal/ (directory contains only ResumeJobDialog + removalCopy); repo-wide grep finds "RemovalConfirmDialog" only in ReviewScreen comments; GroupsPane run-trigger calls `props.onNavigateToReview()` only — src/renderer/groups/GroupsPane.tsx:492; no `startRemoval` call in GroupsPane (comment-only at :336). Exactly one confirm gate; human-verified in 06-05 | closed |
| T-06-04-03 | Tampering | Stage machine snap-back | mitigate | `const [stage, setStage] = useState<WizardStage>('target')` — src/renderer/shell/AppShell.tsx:33; all transitions are explicit `setStage()` calls at action points (:89, :90, :102, :103, :111, :112, :126); the single store-coupled effect (:57-64) is forward-only run→report and guarded on `stage === 'run'` — store changes cannot snap the stage back | closed |
| T-06-04-04 | Repudiation | Dry-run wrong data source | accept | `computePlannedActions(dialogs, checkedDialogIds, severity)` consumes `AdminDialogDTO[]` from `useGroupsStore()` — ReviewScreen.tsx:115, :142; mechanic derived from `d.type` (:78-81), not scan.results; see AR-06-05 | closed |
| T-06-04-05 | Tampering | Resume bypass without review | accept | ResumeJobDialog handles jobs that already passed the Review gate; `removalActions.startRemoval(job.severity, remainingDialogIds)` is dispatched (ResumeJobDialog.tsx:47) before `onResume?.()` fires (:49); the dispatched call still passes all main-process REMOVAL_START gates; see AR-06-08 | closed |
| T-06-04-SC | Tampering | npm installs (plan 04) | accept | No package.json commit in plan 04 — same git evidence as T-06-03-SC; see AR-06-07 | closed |
| T-06-05-01 | Elevation of Privilege | Review confirm → live removal (SAF-02) | verify (human) | CLOSED by human verifier — 06-05-SUMMARY.md Threat Flags: "VERIFIED — human confirmed exactly one confirm gate, no second dialog"; corroborated by T-06-04-02 code evidence | closed |
| T-06-05-02 | Repudiation | Wrong target identity on Review screen (SAF-01) | verify (human) | CLOSED by human verifier — 06-05-SUMMARY.md Threat Flags: "VERIFIED — human confirmed numeric ID visible in monospace, avatar matches resolved target" | closed |
| T-06-05-SC | Tampering | npm install big-integer (late, commit 1375c81) | mitigate | Reasoning verified: commit 1375c81 is 2 insertions total — `"big-integer": "^1.6.52"` added to package.json deps and to the lockfile root manifest entry only; NO new resolved `node_modules/big-integer` lockfile entry (the existing transitive resolution from telegram@2.26.22's `^1.6.48` spec already pinned 1.6.52). `npm ls big-integer` confirms a single deduped instance at 1.6.52 shared with GramJS. Net effect: externalizes the already-installed module out of the main bundle (shared instanceof identity); zero new code fetched | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · verify (human checkpoint) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-06-01 | T-06-01-02 | getSeverity/setSeverity are non-secret preference channels; the only payload is the severity enum, validated in main. No auth tokens or session data flow through them. | Phase 6 plan 06-01 threat model | 2026-06-12 |
| AR-06-02 | T-06-02-02 | A compromised renderer can only toggle which variant of an already-permitted action to request; the destructive action itself remains gated by REMOVAL_START's Zod + auth + double-start + dialog-map layers in main. | Phase 6 plan 06-02 threat model | 2026-06-12 |
| AR-06-03 | T-06-02-03 | electron-store file holds `{"severity":"kick"\|"ban"}` — non-sensitive. Plain JSON in userData is correct per CLAUDE.md; safeStorage is reserved for the session credential and electron-store "encryption" is explicitly forbidden for secrets. | Phase 6 plan 06-02 threat model | 2026-06-12 |
| AR-06-04 | T-06-03-01, T-06-04-01 | UI-layer confirm/stage gates are friction, not security. The enforced boundary is the main-process REMOVAL_START handler (T-05-05): Zod validation, auth step check, double-start guard, and enumerator dialog-map check run regardless of renderer state. | Phase 6 plans 06-03/06-04 threat models | 2026-06-12 |
| AR-06-05 | T-06-03-02, T-06-04-04 | computePlannedActions is pure local computation over already-validated groupsStore data (AdminDialogDTO.type), exactly mirroring RemovalExecutor mechanic selection; no IPC, no new attack surface. Covered by reviewScreen.test.ts unit oracle. | Phase 6 plans 06-03/06-04 threat models | 2026-06-12 |
| AR-06-06 | T-06-03-03 | Review-screen identity comes only from targetStore's `confirmed` state, which is set by the main-process resolver state machine; the renderer cannot inject a different identity without passing through that machine. Human SAF-01 check (T-06-05-02) independently confirmed correct rendering. | Phase 6 plan 06-03 threat model | 2026-06-12 |
| AR-06-07 | T-06-03-SC, T-06-04-SC | No packages installed in plans 03 and 04 — git history shows the only Phase 6 package.json changes are f5d94a4 (electron-store, plan 02, audited) and 1375c81 (big-integer, plan 05, verified in T-06-05-SC). | Phase 6 plans 06-03/06-04 threat models | 2026-06-12 |
| AR-06-08 | T-06-04-05 | ResumeJobDialog only surfaces for an in-progress job that already passed the Review confirm before its first run; resume requires an explicit destructive-styled click (no silent auto-resume), and the re-dispatched startRemoval passes all main-process gates again. Note: `onResume` fires after the startRemoval dispatch (fire-and-forget), not after promise resolution — acceptable because stage advance is cosmetic and authorization is enforced in main. | Phase 6 plan 06-04 threat model | 2026-06-12 |

*Accepted risks do not resurface in future audit runs.*

---

## Unregistered Threat Flags

None. 06-03-SUMMARY.md and 06-05-SUMMARY.md explicitly declare no new security-relevant surface beyond the plan threat models; 06-01/06-02/06-04 summaries contain no `## Threat Flags` section (no flags raised). The one late-surfacing item (big-integer install, plan 05) was registered as T-06-05-SC and is verified above.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-12 | 21 | 21 | 0 | gsd-security-auditor (Claude) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / verify / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-12

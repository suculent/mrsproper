---
phase: 15
slug: renderer-add-mode-contacts-template-reporting
status: verified
threats_open: 0
asvs_level: 1
created: 2026-10-04
---

# Phase 15 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Audited against `main @ 4091ed5`; T-15-03 re-verified closed against `main @ b5d5573` (fix be42017, test 0145bed). Register was authored at plan time (14 plans, deduplicated to 14 threat IDs). Prior-phase invariants cross-referenced: T-14-01 (accessHash never crosses contextBridge), T-14-16 (`resume` computed in main, `AddStartSchema` has no `resume` field), T-14-20 (`startAdd(dialogIds)` only; no raw `ipcRenderer`).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| renderer → CLIPBOARD_WRITE_TEXT | `{ text }` Zod-bounded to 2000 chars (src/main/ipc/clipboardChannels.ts:26,41) then auth-gated (:43). Preload forwards `{ text }` with no transformation (src/preload/index.ts:273-274). Sole renderer caller is the Copy button passing a main-sourced invite link (src/renderer/groups/GroupRow.tsx:172). | invite-link text (main-origin) |
| renderer → ADD_EXPORT_LOG | Handler takes no payload (src/main/ipc/addChannels.ts:266). Source path is `addLogStore.getLogPath()` (:270, computed from `userData` at src/main/storage/addLogStore.ts:136-140); destination is `dialog.showSaveDialog` (:278). Auth-gated as the handler's first statement (:267-269). | add-log.txt copy (contains single-use invite links) |
| renderer → ADD_START (via addStore / ReviewScreen / AddResumeJobDialog) | Only a `string[]` of dialog ids is constructed and forwarded (src/renderer/store/addStore.ts:120-122; src/renderer/wizard/ReviewScreen.tsx:273; src/renderer/removal/AddResumeJobDialog.tsx:51; src/renderer/ipc/addClient.ts:27-28; src/preload/index.ts:231-232). Main `AddStartSchema` accepts `dialogIds` only (src/main/ipc/addChannels.ts:86-88). | dialog ids |
| renderer → TEMPLATE_SET | Template length bound is a single shared constant: `DM_TEMPLATE_MAX_LENGTH = 4000` (src/shared/dmTemplate.ts:41) consumed by the main Zod schema (src/main/ipc/templateChannels.ts:33,49) and by the renderer's `validateDmTemplate` (src/renderer/wizard/addValidation.ts:5,68). | admin-authored DM template |
| renderer → TARGET_ADD_CONTACT | No payload. Renderer dispatch is at-most-once per target via `contactAddAttempted` set synchronously before the await (src/renderer/store/targetStore.ts:145-147); both trigger points delegate to it (TargetCard.tsx:307, ReviewScreen.tsx:275). Main handler is independently auth-gated (addChannels.ts:251). | — |
| shared module ↔ both processes | `src/shared/dmTemplate.ts` is a pure module (no Electron / Node / Zod imports) so main and renderer render the DM byte-identically. | template string, name, links |
| build-time locale JSON → renderer | `add.json` / `groups.json` statically imported (src/renderer/i18n/index.ts:9-24), never fetched; `escapeValue: false` (:70) relies on JSX escaping. Verified: zero `dangerouslySetInnerHTML` / `innerHTML` / `<Trans>` in src/renderer; no HTML tags in the four locale files. | UI copy |
| renderer UI `mode` state | Session-only `useState` in AppShell (src/renderer/shell/AppShell.tsx:45). `mode` appears nowhere in src/preload/index.ts or src/shared/channels.ts — it never crosses IPC. Write-time authorization is `AddExecutor`'s own guard reading `resolver.getResolvedUser()` (src/main/telegram/AddExecutor.ts:203,225-226). | — |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-15-01 | Tampering | clipboardChannels.ts CLIPBOARD_WRITE_TEXT; preload exportAddLog/writeClipboardText | mitigate | `ClipboardWriteSchema = z.object({ text: z.string().max(2000) })` (src/main/ipc/clipboardChannels.ts:26) parsed at :41 before any write; preload forwards `{ text }` untransformed (src/preload/index.ts:273-274) and `exportAddLog` with no payload (:271-272); only renderer caller is GroupRow.tsx:172 passing `addLink`; clipboardChannels.test.ts:65 asserts >2000 chars throws before `clipboard.writeText` | closed |
| T-15-02 | Tampering | addChannels.ts ADD_EXPORT_LOG | mitigate | Handler signature `async () =>` accepts no renderer payload (src/main/ipc/addChannels.ts:266); source `addLogStore.getLogPath()` (:273 → src/main/storage/addLogStore.ts:136-140 joins `userData`); destination `dialog.showSaveDialog` return (:278-284); `copyFileSync(logPath, filePath)` (:290); addChannels.test.ts tests 16-19 | closed |
| T-15-03 | Elevation of Privilege | clipboardChannels.ts, addChannels.ts ADD_EXPORT_LOG | mitigate | Both handlers gated. CLIPBOARD_WRITE_TEXT: `if (getAuthState().step !== 'authorized') return { ok: false }` (src/main/ipc/clipboardChannels.ts:43). ADD_EXPORT_LOG: identical gate is the first statement of the handler (src/main/ipc/addChannels.ts:267-269), before `getLogPath()` (:273) and `showSaveDialog` (:278); file now has four gates (:142, :199, :251, :267). Test 20 (addChannels.test.ts:754-779) registers with `makeGetAuthState('idle')` and asserts `{ ok: false }` with `showSaveDialog`/`copyFileSync` never called. Fixed in be42017 / 0145bed after initial audit. | closed |
| T-15-04 | Tampering | src/shared/dmTemplate.ts; DmTemplateEditor.tsx / addValidation.ts validateDmTemplate; templateChannels.ts Zod gate | mitigate | `export const DM_TEMPLATE_MAX_LENGTH = 4000` (src/shared/dmTemplate.ts:41); imported and used in `TemplateSetSchema = z.object({ template: z.string().min(1).max(DM_TEMPLATE_MAX_LENGTH) })` (src/main/ipc/templateChannels.ts:33,49, parsed at :113); imported and used in `validateDmTemplate` (src/renderer/wizard/addValidation.ts:5,68); DmTemplateEditor imports both (src/renderer/wizard/DmTemplateEditor.tsx:10-11, calls at :35, :83). No re-hardcoded literal in either consumer. | closed |
| T-15-05 | Elevation of Privilege | ReviewScreen.tsx D-16 guard; AppShell.tsx mode state | accept | UI-only convenience guard `isTargetInvalidForAdd` (src/renderer/wizard/ReviewScreen.tsx:249-252). `mode` is `useState` in AppShell.tsx:45, absent from src/preload/index.ts and src/shared/channels.ts (grep: no match) — never sent over IPC. Real authorization: AddExecutor reads `resolver.getResolvedUser()` (src/main/telegram/AddExecutor.ts:203) and short-circuits deleted/bot at :225-226. See AR-15-01. | closed |
| T-15-06 | Denial of Service (self) | targetStore.ts maybeAddToContacts; TargetCard.tsx | mitigate | `if (!addToContactsChecked \|\| contactAddAttempted) return` then `setState({ contactAddAttempted: true })` synchronously before `await` (src/renderer/store/targetStore.ts:145-147); TargetCard.tsx:307 and ReviewScreen.tsx:275 both call `targetActions.maybeAddToContacts()` with no separate guard (grep of TargetCard for `useRef`/`attempted`/`addTargetToContacts`: none) | closed |
| T-15-07 | Tampering | addStore.ts startAdd; ReviewScreen.tsx handleConfirm add branch | mitigate | `startAdd(dialogIds: string[])` single-arg forwarding (src/renderer/store/addStore.ts:120-122); ReviewScreen passes `addGroupActions.map(g => g.dialog.id)` (src/renderer/wizard/ReviewScreen.tsx:273); AddResumeJobDialog passes `remainingDialogIds` (src/renderer/removal/AddResumeJobDialog.tsx:51); addClient.ts:27-28 and preload :231-232 forward `{ dialogIds }` only. Renderer-wide grep for `resume:` / `accessHash` finds only comments. Main invariants preserved: `AddStartSchema` has only `dialogIds` (src/main/ipc/addChannels.ts:86-88). | closed |
| T-15-08 | Tampering | GroupRow.tsx Copy button | accept | `handleCopyLink` passes `addLink ?? ''` (src/renderer/groups/GroupRow.tsx:171-172); `addLink` prop is populated solely from `addOutcome?.link` (src/renderer/groups/GroupsPane.tsx:928), which is AddState pushed from main via `onAddState` (src/renderer/store/addStore.ts:49-50). See AR-15-02. | closed |
| T-15-09 | Tampering | modeRules.ts / addValidation.ts / GroupsPane.tsx partition / groupsStore.ts pre-check | mitigate | Single predicate `isActionableForMode` (src/renderer/groups/modeRules.ts:23-32) used by groupsStore first-scan pre-check (src/renderer/store/groupsStore.ts:83), mode-switch rebuild (:203), GroupsPane partition loop (src/renderer/groups/GroupsPane.tsx:164), and GroupRow (src/renderer/groups/GroupRow.tsx:142). Inputs are `AdminDialogDTO` / `MembershipStatus` from main. `computeAddGroups` re-filters on `d.canAdd` (addValidation.ts:39). Plan 15-03's accept half recorded as AR-15-03. | closed |
| T-15-10 | Tampering | add.json / groups.json locale files | accept | Static imports (src/renderer/i18n/index.ts:9-24); `escapeValue: false` (:70). Verified: `grep -rn dangerouslySetInnerHTML\|innerHTML src/renderer` → no match; `<Trans` → no match; no `<tag` in en/cs add.json or groups.json. See AR-15-04. | closed |
| T-15-11 | Information Disclosure | ADD_EXPORT_LOG; GroupsPane/SettingsMenu export buttons | accept | User-initiated: GroupsPane.tsx:547 and SettingsMenu.tsx:39 call `addClient.exportAddLog()` with no args; destination only via native `showSaveDialog` (addChannels.ts:278); source file written at 0o600 (src/main/storage/addLogStore.ts:159,164). See AR-15-05 (note: the accept rationale assumes the caller is authorized — see T-15-03). | closed |
| T-15-12 | Tampering | AddResumeJobDialog.tsx | mitigate | `<Dialog open={open} onOpenChange={() => {}}>` (src/renderer/removal/AddResumeJobDialog.tsx:59); AppShell also passes a no-op `onOpenChange={() => {}}` (src/renderer/shell/AppShell.tsx:199). Discard only via explicit button handler (:47). | closed |
| T-15-14-01 | Tampering | GroupRow.tsx isGreyedVisual / addGreyReasonKey | mitigate | `isActionable = isActionableForMode(dialog, membershipStatus, activeMode)` (src/renderer/groups/GroupRow.tsx:142); `isGreyedVisual = activeMode === 'add' ? !isActionable && !isPending && !isFailed : !dialog.canAct` (:151-152); `addGreyReasonKey` derived from the same inputs (:157-162); checkbox branch uses the same `isActionable` (:318). | closed |
| T-15-14-02 | Repudiation | groupsStore.ts first-scan-complete pre-check (_activeMode) | accept | `_activeMode` module-level (src/renderer/store/groupsStore.ts:41) set only in `recomputeCheckedForMode` (:193), consumed by the first-complete rebuild (:83); ModeSwitch calls `recomputeCheckedForMode` on every switch before `onChange` (src/renderer/groups/ModeSwitch.tsx:25-26); dispatch still requires explicit `handleConfirm` (ReviewScreen.tsx:266). See AR-15-06. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

### Resolution note — T-15-03

Initial audit (main @ 4091ed5) found the ADD_EXPORT_LOG half of T-15-03 open: the handler at src/main/ipc/addChannels.ts:266-292 had no `getAuthState()` call despite Plan 15-02 line 131 specifying it. Closed by be42017 (gate inserted at :267-269) and 0145bed (unauthenticated-caller test 20). Re-verified by re-reading the handler and test and running `vitest run src/main/ipc/addChannels.test.ts src/main/ipc/clipboardChannels.test.ts` green.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-15-01 | T-15-05 | The ReviewScreen deleted/bot confirm-disable and AppShell `mode` are UI-layer only. `mode` never crosses IPC (absent from preload and channels), and the authoritative deleted/bot guard is AddExecutor's main-process pre-flight reading `resolver.getResolvedUser()` exclusively (AddExecutor.ts:203,225-226). A bypassed UI guard results in zero API traffic, not an unauthorized write. | Plans 15-10, 15-13 threat models; verified by security audit | 2026-10-04 |
| AR-15-02 | T-15-08 | The only value the Copy button writes to the clipboard is `AddGroupOutcome.link`, produced in main by `ExportChatInvite` and pushed to the renderer via `onAddState`. The renderer never constructs or edits this string; the main-side Zod bound (2000) and auth gate remain in force. | Plan 15-08 threat model; verified by security audit | 2026-10-04 |
| AR-15-03 | T-15-09 (Plan 15-03 half) | `modeRules.ts` and `addValidation.ts` are pure renderer derivations over `AdminDialogDTO.canAct/canAdd/addGreyReason` (computed in main at enumeration, Phase 13) and `MembershipStatus` (from the main-process scan). They introduce no new attacker-controlled input; the mitigate half (single predicate) is closed above. | Plan 15-03 threat model; verified by security audit | 2026-10-04 |
| AR-15-04 | T-15-10 | Locale JSON is build-time static content bundled by Vite — no runtime fetch (CSP connect-src none). Strings are rendered through JSX text nodes only; verified zero `dangerouslySetInnerHTML` / `innerHTML` / `<Trans>` usage in src/renderer and no HTML tags in the four Phase 15 locale files. `escapeValue: false` is therefore safe. | Plan 15-04 threat model; verified by security audit | 2026-10-04 |
| AR-15-05 | T-15-11 | Exporting add-log.txt is the feature's purpose (ADD-14): the admin deliberately copies their own 0o600 log to a location they choose through the OS-native save dialog. The renderer supplies neither path. The handler is auth-gated (addChannels.ts:267-269, T-15-03 closed), so only an authorized session can trigger the export. | Plans 15-02, 15-09 threat models; verified by security audit | 2026-10-04 |
| AR-15-06 | T-15-14-02 | If `_activeMode` were stale at first-scan-complete, the worst outcome is a pre-check set computed for the wrong mode, which `recomputeCheckedForMode` rebuilds on the next mode switch (ModeSwitch.tsx:25). No Telegram write can originate from the pre-check alone — every dispatch path goes through ReviewScreen's explicit confirm (`handleConfirm`, :266) and `computeAddGroups`'s `canAdd` re-filter (addValidation.ts:39). | Plan 15-14 threat model; verified by security audit | 2026-10-04 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-04 | 14 | 13 | 1 | gsd-security-auditor (main @ 4091ed5; register authored at plan time across 14 plans) |
| 2026-10-04 | 14 | 14 | 0 | gsd-security-auditor (re-verification of T-15-03 after fix be42017 + test 0145bed; main @ b5d5573) |

Threat Flags: no SUMMARY in Phase 15 contains a `## Threat Flags` section; all SUMMARY deviations reviewed (15-01 comment wording, 15-02 `require` → dynamic `import` in ADD_EXPORT_LOG, 15-10 commit order, 15-14 test-assertion precision) — none introduce new attack surface. Unregistered flags: none.

Cross-phase invariants re-verified: T-14-16 (`AddStartSchema` = `{ dialogIds }` only, addChannels.ts:86-88), T-14-20 (preload `startAdd(dialogIds)`, `getAddJob()` → `AddJobFileSafe`, no raw `ipcRenderer`, preload/index.ts:231-251), T-14-01 (no `accessHash` constructed anywhere in src/renderer).

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-04

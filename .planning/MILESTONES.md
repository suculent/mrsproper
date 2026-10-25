# Milestones

## v1.7 Add Mode (Shipped: 2026-10-25)

**Phases completed:** 5 phases (13–17), 41 plans

**Delivered:** A fourth action, Add, that puts the resolved, verified target into every selected
group they are not yet in. It invites into supergroups/channels and adds to basic groups, unbans
first when needed, and falls back to unique 5-day invite links sent in one templated DM when privacy
blocks a direct add. It runs on the same throttled, checkpointed, resumable pipeline as Remove/Tag,
with an inverted checklist, add-to-contacts, an editable en/cs DM template, an add log export,
and a target-identity lock across relaunch-resume.

**Key accomplishments:**

- **Phase 13**: Main-computed `canAdd`/`addGreyReason` on every `AdminDialogDTO` (broadcast channels included when the admin holds the invite right). MembershipScanner now reports a distinct `banned` status. TagExecutor collapsed to a single-client loop at the default layer, and the dead layer-224 `tagClient`/`tagApi` modules were deleted (TAG-07).
- **Phase 14**: `AddExecutor`, built TDD with 54 tests. Covers `InviteToChannel`/`AddChatUser` dispatch, unban-before-invite, deleted/bot pre-flight, privacy-block expiring links plus a single end-of-run DM, PEER_FLOOD hard-stop and D-20 continuation resume. It persists to Zod-validated `add-job.json` and an append-only `add-log.txt`, with a non-blocking contact service and the gated `ADD_*` IPC surface.
- **Phase 15**: Renderer Add mode. Remove/Tag/Add `ModeSwitch`, an inverted checklist via `isActionableForMode`, an add-to-contacts checkbox, `DmTemplateEditor` with a byte-identical shared `renderTemplate` preview, Add review/run/report bands with per-group retry and Copy-link, `AddResumeJobDialog`, add-log export, and a new `add` i18n namespace (en + cs).
- **Phase 16** (audit gap closure): the relaunch resume rebuilds the target from the job file and continues the same jobId with the full dialog set. A main-computed `canUnban` drives the Add predicate. Add mode got a cause-aware empty state, and the DM language is read at render time.
- **Phase 17** (re-audit gap closure): the renderer job view shows a relaunch-resumed run (progress, Stop, PEER_FLOOD Resume, summary) via `JobTargetCard`. The target identity is locked while an add job exists (lookup lock, `checkResumeIdentity`, explicit `ADD_RESUME`). `bannedDialogIds` is persisted so unban-first survives a relaunch. Retry links now get a DM and a log block, a stopped run can be resumed in the same session, the default DM follows the detected OS language, and an IPC-level relaunch integration suite was added.
- **Quick 261025-dnf**: closed audit warnings W1 (language IPC registered before the window), W2 (forced modes sync the groupsStore pre-check) and W4 (logout wipes the add job, executor and resolver state).

**Known deferred items at close:** audit status `tech_debt` (see [milestones/v1.7-MILESTONE-AUDIT.md](milestones/v1.7-MILESTONE-AUDIT.md)):
- W3: stage stays `report` after an in-session Resume (cosmetic step indicator).
- W5: main does not block a concurrent Remove/Tag run alongside Add (the governor still serialises calls).
- WR-03: a hard-stop during the end-of-run DM leaves the DM unsent with no add-log block.
- Replacing or discarding a stopped job drops its earlier-segment links.
- UI-REVIEW 18/24 polish: disabled-button tooltips, stopped-band buttons clickable during an in-flight Resume, and no placeholder on queued rows.
- Phase 16/17 VALIDATION drafts (Nyquist partial). 5 server-behaviour checks need a live account. Dialogs added after the scan are excluded from Review.
- Remove/Tag job files still survive logout. The `config.test.ts` failure is env-dependent.

---

## v1.6 Member Tag Action (Shipped: 2026-06-20)

**Phases completed:** 4 phases (9–12), 13 plans

**Delivered:** A third action — Tag — alongside Kick/Ban that sets a Telegram member tag across all
selected supergroups/channels via `messages.editChatParticipantRank` over an isolated layer-224
connection, reusing the throttled, resumable, audited execution pipeline. Confirmed working
end-to-end against a real account.

**Key accomplishments:**

- **Phase 9** — Vendored the GramJS-absent `editChatParticipantRank#a00f32b0` TL request (golden-byte verified) and a write-only layer-224 `TagClient` (patch-connect-restore of `AllTLObjects.LAYER`, governor-routed).
- **Phase 10** — Shared `tagTypes`, Zod-validated IPC (`tagChannels`) carrying only `{dialogIds, tag}` (identity from main process only), and durable `tag-job.json` audit/checkpoint with launch-time resume detection.
- **Phase 11** — `TagExecutor`: throttled, generation-guarded, resumable state machine; already-admin + basic-group skip; PEER_FLOOD hard-stop; FLOOD_WAIT via governor.
- **Phase 12** — Renderer: 3-way Kick/Ban/Tag picker, tag input with live validation, confirmation gate, live per-group progress + FLOOD_WAIT countdown, results report; new `tag` i18n namespace (en + cs).
- **Post-ship fix (live-verified):** two-phase layer isolation — a concurrent layer-224 connection upgrades the shared session to 224 and corrupts the main layer-198 client's response parsing; resolved by separating 198 reads from 224 writes and restoring the main client to 198 afterward.

**Known deferred items at close:** 5 (see STATE.md Deferred Items) — Phase 12 residual UAT
(TagInput focus, Day/Night×en/cs visual), provisional 16-char `TAG_MAX_LENGTH`, and 2 inherited UI todos.

---

## v1.0 MVP (Shipped: 2026-06-13)

**Phases completed:** 9 phases, 57 plans, 80 tasks

**Key accomplishments:**

- electron-vite three-bundle Electron shell with hardened BrowserWindow, build-time api_id/api_hash injection (main bundle only), shadcn/ui initialized with Phase 1 design tokens, offline Inter font, and unsigned-runnable electron-builder config for macOS + Windows
- Vitest test infrastructure with configurable GramJS/safeStorage mocks and a complete RED test suite encoding AUTH-01..05 + D-13/D-17 against the finalized AuthState shared contract
- TDD GREEN: Encrypted session persistence, jargon-free error classification, injectable-clock FloodWait countdown — 22 tests pass
- TDD GREEN: Stepped GramJS auth flow, auth state machine, zod-validated IPC trust boundary, restore-on-launch — 10 target tests GREEN, 33/35 total tests GREEN
- Build GREEN: stepped phone/code/2FA login UI, FLOOD_WAIT countdown, authenticated shell with identity display, settings-menu logout, and all reusable UI patterns — all over window.mrproper, no GramJS in renderer.
- Typed Disposition/GovernorEvent contracts in opTypes.ts plus RED test stubs establishing the governor and classifier test surface for Plan 02-02
- One-liner:
- One-liner:
- Task 1 — TypeScript cleanup + comment corrections (no behavioral change):
- One-liner:
- TargetResolver service and targetChannels IPC handlers turning 23 RED tests GREEN — username/phone resolution via governor, bio + avatar fetch with graceful fallback, confirm gate, and Zod-validated IPC boundary
- Full IPC stack wired: contextBridge exposes 6 target methods, targetClient.ts and targetStore.ts (useTargetStore + targetActions) give Plan 05 UI components direct subscription-based access to TargetState and governor flood countdown
- One-liner:
- One-liner:
- Mock client extensions
- groupTypes.ts
- GroupEnumerator.ts
- MembershipScanner.ts
- groupChannels.ts
- groupsClient.ts
- groupsCopy.ts
- GroupsPane.tsx
- AppShell.tsx
- Full Phase 4 flow human-verified after five targeted regression fixes: two-pane shell, eager group enumeration, membership scan with streaming progress, and togglable pre-checked/greyed rows all confirmed working end-to-end
- Generation guard in retryGroup(), abortScan() on TARGET_RESET, and _prevScanStep first-complete guard close three scan-lifecycle bugs that broke target-change re-scan, retry crash safety, and manual checkbox deselection preservation
- One-liner:
- One-liner:
- Typed, Zod-validated IPC bridge for name search (SEARCH_START/ABORT/GET_STATE, TARGET_RESOLVE_CANDIDATE) with full security gates, CR-01 abort ordering, and preload exposure of 5 search bridge methods
- One-liner:
- Name-search UI surface complete: streaming CandidateList with progress/stop, CandidateRow with avatar+identity+found-in, searchCopy.ts copy module, AppShell wired — full candidate disambiguation flow end-to-end
- One-liner:
- Extended mock GramJS client with EditBanned/DeleteChatUser call-recording and wrote 29 Wave 0 RED it.todo stubs across three test files — Nyquist compliance gate before removal engine implementation.
- One-liner:
- RemovalExecutor implemented as a generation-guarded state machine: ban uses single EditBanned call, kick uses restrict-then-unban with 500ms sleep, basic group always uses DeleteChatUser — all 15 TDD test stubs GREEN.
- One-liner:
- One-liner:
- Per-row removal status rendering (6 states), run-trigger, throttled progress indicator, summary band, and crash-resume dialog wired end-to-end; live human verification approved 2026-06-12 after 4 fix iterations including a critical GramJS ignoreMigrated inversion bug and a tsc --noEmit no-op discovery.
- floodWaitRemaining added to RemovalState, SEVERITY_GET/SET IPC channels wired end-to-end (channels → preload → severityClient), and 14 Wave 0 it.todo() stubs planted for SAF-01/02/03 coverage
- One-liner:
- One-liner:
- One-liner:
- Full five-stage wizard end-to-end verified by human: SAF-01/02/03 confirmed, change-target, severity persistence, and layout stability fixed across a three-round fix loop
- Electron downgraded from ^42.0.0 to exact pin 37.10.3 — the last major with LSMinimumSystemVersion: 11.0 (Big Sur), enabling the primary admin's macOS 11.7.10 machine as a packaging prerequisite
- Sub-task A — build/entitlements.mac.plist (new file)
- Signed and notarized v0.9.1 RC DMGs (arm64 + x64) plus unsigned Windows installers produced, Gatekeeper-verified (spctl Notarized Developer ID + stapler validate), and confirmed by human checkpoint.
- 3 of 4 machines passed 0.9.1 RC smoke test (ARM Mac, Intel Mac, Windows 10 PASS; Big Sur 11.7.10 deferred by explicit user decision — machine unavailable)
- One-liner:
- Packages installed:
- `src/renderer/i18n/index.ts`
- One-liner:
- One-liner:
- One-liner:
- Task 1 — GroupRow.tsx migration:
- One-liner:
- Wave 5 automated gate GREEN and human UAT APPROVED — TargetCard i18n gap found during UAT and resolved (LastSeenDTO architecture + 18 target.json keys); all 7 UAT steps pass, Phase 8 localization complete

---

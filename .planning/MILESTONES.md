# Milestones

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

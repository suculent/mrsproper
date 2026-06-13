---
phase: "03"
plan: "05"
subsystem: "renderer-ui"
tags:
  - target-resolution
  - identity-card
  - ui-components
  - app-branding
  - icons
dependency_graph:
  requires:
    - 03-04  # targetClient, targetStore, preload bridge
    - 03-03  # TargetResolver, targetChannels
  provides:
    - TargetInput component (live in app)
    - TargetCard component (live in app)
    - resolveCopy.ts (all UI strings)
    - StubbedWorkflowRegions replaced by real components
    - App renamed to Mrs. Proper / MrsProper binary
    - macOS icon (round PNG) and Windows icon (square PNG) wired
  affects:
    - src/renderer/shell/AppShell.tsx
    - src/renderer/shell/StubbedWorkflowRegions.tsx
    - src/renderer/target/
    - build/
    - electron-builder.yml
    - package.json
tech_stack:
  added: []
  patterns:
    - External store (useSyncExternalStore) feeding stateless presentational components
    - Colored-initials avatar fallback via BigInt modulo palette
    - Discriminated union render gating (idle/resolving/resolved/confirmed/error)
    - bytesToDataUrl chunked conversion for Uint8Array avatar bytes
    - electron-builder mac.extendInfo CFBundleDisplayName for display name vs binary name split
key_files:
  created:
    - src/renderer/target/resolveCopy.ts
    - src/renderer/target/TargetInput.tsx
    - src/renderer/target/TargetCard.tsx
    - build/icon.png
    - build/icon-win.png
  modified:
    - src/renderer/shell/StubbedWorkflowRegions.tsx
    - src/renderer/shell/AppShell.tsx
    - src/main/index.ts
    - electron-builder.yml
    - package.json
decisions:
  - TargetCard duplicates bytesToDataUrl/getInitials from IdentityDisplay.tsx rather than extracting to a shared util (avoids premature abstraction; both files are small and co-located)
  - productName=MrsProper (binary) + CFBundleDisplayName="Mrs. Proper" (macOS Finder/Dock); in-app UI strings say "Mrs. Proper"
  - Round JPEG source used for macOS icon (aligned with Apple HIG round-rect aesthetic); square JPEG for Windows
  - electron-builder derives icns/ico from 1024x1024 PNG at package time — no separate iconset step needed for dev builds
metrics:
  duration_minutes: 15
  completed_date: "2026-06-11"
  tasks_completed: 2
  tasks_total: 2
  files_created: 5
  files_modified: 5
---

# Phase 3 Plan 5: UI Layer — TargetInput, TargetCard, Branding Summary

**One-liner:** React identity-card UI with smart input (mode detection, CountryPicker, flood countdown), TargetCard confirm gate wired to live targetStore, app renamed Mrs. Proper with macOS/Windows icons converted from JPEG sources.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create resolveCopy.ts + TargetInput.tsx | dfa899b | src/renderer/target/resolveCopy.ts, src/renderer/target/TargetInput.tsx |
| 2 | Create TargetCard.tsx + update StubbedWorkflowRegions.tsx | 1062f5d | src/renderer/target/TargetCard.tsx, src/renderer/shell/StubbedWorkflowRegions.tsx |

## Deviations from Plan

### User-Requested Additions (approved after checkpoint)

These were requested by the user at the checkpoint boundary. Each was implemented as a separate atomic commit.

**1. [User Request] Header layout redesign**
- **Commit:** 064447b
- **Change:** Removed "MrProper" text from header. Moved IdentityDisplay (avatar + username) to the LEFT side. Settings wheel remains on RIGHT.
- **Files modified:** src/renderer/shell/AppShell.tsx

**2. [User Request] Application rename to "Mrs. Proper"**
- **Commit:** 58eca56
- **Change:** package.json name -> `mrsproper` (npm-valid); electron-builder.yml productName -> `MrsProper` (binary stem: MrsProper.app / MrsProper.exe); appId -> `cz.corpus.mrsproper`; macOS CFBundleDisplayName -> "Mrs. Proper" via extendInfo; DMG title -> "Mrs. Proper"; BrowserWindow title -> "Mrs. Proper"; TargetCard tooltip updated.
- **Files modified:** package.json, electron-builder.yml, src/main/index.ts, src/renderer/target/TargetCard.tsx

**3. [User Request] Custom app icons from build/icon-source*.jpeg**
- **Commit:** 43b87aa
- **Change:** Converted build/icon-source-round.jpeg (1024x1024) -> build/icon.png via `sips`; converted build/icon-source.jpeg (1024x1024) -> build/icon-win.png via `sips`. Wired mac.icon -> build/icon.png and win.icon -> build/icon-win.png in electron-builder.yml. electron-builder will derive icns/ico at package time.
- **Files created:** build/icon.png, build/icon-win.png
- **Files modified:** electron-builder.yml

## Verification Results

- `npx tsc --noEmit`: exits 0 (no errors)
- `npm test`: 103/105 pass — 2 pre-existing failures in config.test.ts (MRPROPER_API_ID/MRPROPER_API_HASH env vars unset, not in scope)
- Group-list stub text unchanged: "Your groups will appear here once a target is selected."
- accessHash: no reference in TargetCard.tsx (security boundary maintained, T-03-01)

## Known Stubs

- Group list section in StubbedWorkflowRegions.tsx remains a placeholder ("Group list area — coming soon") — intentional; will be replaced in Phase 4.

## Threat Flags

None. No new network endpoints, auth paths, or trust boundary changes introduced. TargetCard renders only ResolvedTargetDTO fields (no accessHash exposure, T-03-01 maintained).

## Self-Check: PASSED

- src/renderer/target/TargetCard.tsx — FOUND
- src/renderer/target/resolveCopy.ts — FOUND (Task 1, prior agent)
- src/renderer/target/TargetInput.tsx — FOUND (Task 1, prior agent)
- src/renderer/shell/StubbedWorkflowRegions.tsx — FOUND (updated)
- build/icon.png — FOUND
- build/icon-win.png — FOUND
- Commits dfa899b, 1062f5d, 064447b, 58eca56, 43b87aa — all present in git log

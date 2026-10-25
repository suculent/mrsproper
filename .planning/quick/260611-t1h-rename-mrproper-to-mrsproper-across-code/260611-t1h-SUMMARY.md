---
status: complete
phase: 260611-t1h
plan: 01
type: quick
subsystem: renderer-ipc, main-config, build
tags: [rename, identifier-hygiene, ipc, env-vars]
dependency_graph:
  requires: []
  provides: [consistent-mrsproper-identifiers]
  affects: [src/preload/index.ts, src/renderer/ipc, src/main/telegram/config.ts, electron.vite.config.ts]
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  modified:
    - src/renderer/index.html
    - src/preload/index.ts
    - src/renderer/ipc/authClient.ts
    - src/renderer/ipc/targetClient.ts
    - src/main/telegram/config.ts
    - src/main/telegram/config.test.ts
    - electron.vite.config.ts
    - electron-builder.yml
    - .env.example
decisions:
  - "Page title uses 'Mrs. Proper' (human-readable with space+period) matching BrowserWindow title and CFBundleDisplayName"
  - "contextBridge key is 'mrsproper' (lowercase, no separator) — consistent with npm package name convention"
  - "TypeScript interface merging: both authClient.ts and targetClient.ts declare interface MrsProperApi in declare global; TypeScript merges by name so both must use the same identifier"
  - ".env.example path comment updated to MrsProper slug for forward-compatibility; actual .env on disk updated but not committed"
metrics:
  duration_minutes: 10
  completed_date: 2026-06-11
  tasks_completed: 3
  files_modified: 9
---

# Quick Task 260611-t1h: Rename MrProper to MrsProper Across Code

**One-liner:** Renamed all mrproper/MrProper/MRPROPER_ identifiers to mrsproper/MrsProper/MRSPROPER_ across renderer IPC, preload bridge, main config, build config, and env files — zero residual old references, HTML title now "Mrs. Proper".

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Fix page title and IPC bridge key + TypeScript interface rename | aef9e1c | src/renderer/index.html, src/preload/index.ts, src/renderer/ipc/authClient.ts, src/renderer/ipc/targetClient.ts |
| 2 | Rename MRPROPER_* env vars in config, build config, and env files | ea57b7c | src/main/telegram/config.ts, config.test.ts, electron.vite.config.ts, electron-builder.yml, .env.example |
| 3 | Final sweep and build verification | 618d5a9 | .env.example (path comment) |

## Changes Made

### Task 1: Renderer / IPC Layer

- `src/renderer/index.html`: `<title>MrProper</title>` -> `<title>Mrs. Proper</title>`
- `src/preload/index.ts`: `exposeInMainWorld('mrproper', ...)` -> `exposeInMainWorld('mrsproper', ...)`
- `src/renderer/ipc/authClient.ts`: Interface `MrProperApi` -> `MrsProperApi`; `Window.mrproper` -> `Window.mrsproper`; all 8 `window.mrproper.*` calls updated
- `src/renderer/ipc/targetClient.ts`: Interface augment `MrProperApi` -> `MrsProperApi`; all 6 `window.mrproper.*` calls updated; comment updated

### Task 2: Config and Build Files

- `src/main/telegram/config.ts`: `import.meta.env.MRPROPER_*` -> `import.meta.env.MRSPROPER_*` (both API_ID and API_HASH)
- `src/main/telegram/config.test.ts`: All 5 `MRPROPER_` string literal/comment occurrences -> `MRSPROPER_`
- `electron.vite.config.ts`: `define` block keys + comment updated from `MRPROPER_*` to `MRSPROPER_*`
- `electron-builder.yml`: Comment `MrProper.app` -> `MrsProper.app`
- `.env.example`: Comment + key names `MRPROPER_*` -> `MRSPROPER_*`
- `.env` (not committed): Key names `MRPROPER_*` -> `MRSPROPER_*`; values preserved intact

### Task 3: Sweep Fix

- `.env.example`: Memory file path hint updated from `-MrProper-` to `-MrsProper-` slug in the project path comment

## Verification Results

| Check | Result |
|-------|--------|
| `grep -ri mrproper src/ package.json ... | grep -vi mrsproper` | 0 lines (PASS) |
| `npx tsc --noEmit -p tsconfig.web.json` | No errors (PASS) |
| `npx tsc --noEmit -p tsconfig.node.json` | Pre-existing errors only, no new errors (PASS) |
| `npm test` | 112 passed / 2 failed — matches baseline (PASS) |
| `npm run build` | Exits 0 (PASS) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Additional line in .env.example path comment**

- **Found during:** Task 3 final sweep
- **Issue:** The .env.example comment contained a filesystem path `~/.claude/projects/-Users-igraczech-Repositories-MrProper/memory/...` that matched the residual grep filter despite Task 2 having updated all key names
- **Fix:** Updated the path comment slug from `MrProper` to `MrsProper` for forward-compatibility (the comment is a hint, not a working path; updating it is safe)
- **Files modified:** .env.example
- **Commit:** 618d5a9

## Known Stubs

None. This is a pure rename with no new UI or data-handling code.

## Threat Flags

None. All changes are identifier renames in existing surface; no new network endpoints, auth paths, or schema changes introduced. The .env rename maintains the same trust boundary (gitignored, OS credential store).

## Self-Check: PASSED

- aef9e1c verified: `git log --oneline | grep aef9e1c` -> found
- ea57b7c verified: `git log --oneline | grep ea57b7c` -> found
- 618d5a9 verified: `git log --oneline | grep 618d5a9` -> found
- All 9 modified files exist on disk and contain updated identifiers
- `grep -ri "mrproper" src/ package.json ...` returns 0 lines

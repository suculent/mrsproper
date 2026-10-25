---
status: complete
phase: quick-260620-f8a
plan: "01"
subsystem: scripts/spike
tags: [spike, member-tag, gramjs, throwaway, dev-only]
dependency_graph:
  requires: []
  provides: [scripts/spike-member-tag.mjs]
  affects: []
tech_stack:
  added: []
  patterns:
    - createRequire CJS interop for telegram@2.26.22 inside .mjs
    - bigInt() id/accessHash construction (mirrors RemovalExecutor.ts)
    - readline stdin prompts for interactive GramJS login
key_files:
  created:
    - scripts/spike-member-tag.mjs
  modified: []
decisions:
  - Script is throwaway dev-only; never imported from src/ or Electron build
  - Uses own StringSession login; never reads production safeStorage (Electron-only)
  - dotenv/config loaded first to populate MRSPROPER_API_ID/MRSPROPER_API_HASH
  - Q5 basic-group guard exits early — channels.EditAdmin is channels-only
  - Confirmation gate requires literal "yes" or --confirm flag before write call
  - Session string printed labeled to stdout only; never written to any file
metrics:
  duration: "~3 min"
  completed: "2026-06-20T09:04:01Z"
  tasks: 1
  files: 1
---

# Quick Task 260620-f8a: Spike Member Tag — Summary

**One-liner:** Throwaway Node ESM spike script that performs fresh GramJS login and probes channels.EditAdmin+rank for Q1–Q5 member-tag design decisions with confirmation gate and pre/post participant diff.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write spike-member-tag.mjs | 1c4f674 | scripts/spike-member-tag.mjs |

## What Was Built

`scripts/spike-member-tag.mjs` — a self-contained interactive Node ESM script (458 lines) that:

1. Loads `.env` via `dotenv/config` for `MRSPROPER_API_ID` / `MRSPROPER_API_HASH`
2. Uses `createRequire(import.meta.url)` CJS interop to import `telegram` (GramJS 2.26.22, CommonJS) and `big-integer` from `node_modules`
3. Parses `--group`, `--user`, `--tag`, `--session`, and `--confirm` from `process.argv` with a usage-and-exit guard for missing required args
4. Performs fresh interactive GramJS login via `client.start()` with `readline` stdin callbacks for phone/code/2FA; prints `client.session.save()` to stdout for reuse via `--session`
5. **Q5 probe:** resolves group entity, prints `className`, detects `Chat` (basic group) and exits before any write — channels.EditAdmin is channels-only
6. **Q2 pre-call:** calls `client.getParticipants()`, finds target, dumps raw participant as BigInt-safe JSON
7. **Confirmation gate:** echoes exact group/user/rank/adminRights to stdout; requires typed `'yes'` unless `--confirm` is passed
8. **Q1/Q2/Q3 probe:** invokes `channels.EditAdmin` with `InputChannel` + `InputPeerUser` constructed via `bigInt(entity.id.toString())` / `bigInt(entity.accessHash.toString())` — exact mirror of RemovalExecutor.ts — and `ChatAdminRights({})` (all flags omitted/false) plus the `rank` string; prints raw result or labeled RPC error with common error code guide
9. **Q2 post-call:** repeats participant snapshot and prints diff (type changed? rank changed?)
10. **Q4 guidance:** prints max-length/charset test instructions after call completes
11. Calls `client.disconnect()` and `process.exit(0)` gracefully

## Verification

All three plan verification checks passed:

- Structural check (15 token assertions): **All structural checks passed.**
- `grep -r "spike-member-tag" src/ electron.vite.config.ts`: **No matches** (script not imported from production)
- `grep "spike-member-tag" .gitignore`: **No match** (script is tracked as a dev tool)

## Deviations from Plan

None — plan executed exactly as written.

Anti-patterns confirmed absent:
- No imports from `src/`
- No `client.kickParticipant()` — only `client.invoke()` used
- No `bigInt.zero` for accessHash on the target user
- No credentials written to any file
- No production safeStorage access

## Known Stubs

None. This is a probe script with no UI or data-wiring stubs.

## Threat Flags

None. All surface in this script is within the plan's threat model (T-f8a-01 through T-f8a-SC):
- Session string printed labeled to stdout only (T-f8a-01: accepted)
- editAdmin gated by explicit confirmation (T-f8a-02: mitigated)
- Operator's own account authority (T-f8a-03: accepted)
- .env is gitignored (T-f8a-04: accepted)

## Self-Check: PASSED

- `scripts/spike-member-tag.mjs` exists: FOUND
- Commit 1c4f674 exists: FOUND
- All structural verification tokens present: CONFIRMED

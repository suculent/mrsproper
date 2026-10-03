---
status: complete
status-note: "All TL229 verification passed. The 2 failing tests in src/main/telegram/config.test.ts (AUTH-03 env-injection) are pre-existing and environment-only: the orchestrator re-ran them with .env loaded (set -a; . ./.env) and all 3 pass. Unrelated to any file this plan touched."
phase: quick-261003-jni
plan: 01
subsystem: infra
tags: [gramjs, telegram, mtproto, tl-schema, vitest, electron]

requires: []
provides:
  - "vendor/telegram-api.tl — git-tracked layer-229 TDLib TL schema"
  - "scripts/tl-update.mjs — refreshes vendor/telegram-api.tl from upstream TDLib"
  - "scripts/tl-apply.mjs — patches node_modules/telegram to layer 229, wired as postinstall"
  - "Layer-neutral TagClient (no more global LAYER mutation per connection)"
  - "src/main/telegram/tlLayer.test.ts — regression guard against layer drift"
affects: [telegram-client, tag-executor, tag-client, main-client-connection]

tech-stack:
  added: []
  patterns:
    - "Vendor-file + regeneration pattern for patching a third-party package's generated artifacts reproducibly on every npm install (postinstall hook), instead of hand-maintaining a diff/patch file."

key-files:
  created:
    - vendor/telegram-api.tl
    - scripts/tl-update.mjs
    - scripts/tl-apply.mjs
    - src/main/telegram/tlLayer.test.ts
  modified:
    - package.json
    - README.md
    - src/main/telegram/tagClient.ts
    - src/main/telegram/tagClient.test.ts

key-decisions:
  - "Patch node_modules/telegram's TL layer via a reproducible postinstall script (tl-apply.mjs) driven by a git-tracked vendor file, rather than maintaining a hand patch or forking GramJS."
  - "Delete TagClient's patch-connect-restore LAYER mutation entirely now that the whole installed package runs at layer 229 natively — no per-connection layer juggling needed."
  - "Keep the TypeNotFoundError/unparseable-response catch in TagClient.invoke() as a defensive fallback (not layer-specific) rather than removing it, since it protects against any future unparseable response shape."

patterns-established:
  - "Pattern: third-party package TL/schema upgrades = vendor file (git-tracked, human-reviewed diff) + idempotent apply script (postinstall hook) + regression test importing the REAL package (not a mock) to catch silent drift."

requirements-completed: [TL229-01, TL229-02, TL229-03, TL229-04]

duration: 41min
completed: 2026-10-03
---

# Quick Task 261003-jni: Move GramJS client to TL layer 229 Summary

**Vendored TDLib's layer-229 TL schema and wired a reproducible postinstall script to patch `node_modules/telegram` to layer 229, then deleted TagClient's now-unnecessary per-connection LAYER patch-connect-restore hack.**

## Performance

- **Duration:** 41 min (14:40 - 15:21 CEST)
- **Started:** 2026-10-03T12:40:00Z (approx, first commit 14:40:55 +0200)
- **Completed:** 2026-10-03T13:20:43Z (last commit 15:20:43 +0200)
- **Tasks:** 3/3 completed
- **Files modified:** 8 (4 created, 4 modified)

## Accomplishments

- `vendor/telegram-api.tl` now holds TDLib's current (layer 229) `telegram_api.tl`, preamble-stripped and git-tracked, with `npm run tl:update` able to refresh it from upstream on demand.
- `scripts/tl-apply.mjs` reproducibly regenerates `node_modules/telegram`'s `apiTl.js`/`schemaTl.js`/`api.d.ts` from the vendor file and bumps `AllTLObjects.LAYER` to 229, wired as the `postinstall` npm lifecycle hook (and as `npm run tl:apply` for manual re-runs). Verified idempotent across two consecutive runs.
- `TagClient.connect()` no longer mutates any global TL layer — the patch-connect-restore mechanism (and all `AllTLObjects` references) were deleted from `tagClient.ts`. `TagClient` now connects at the package's ambient layer (229).
- New `tlLayer.test.ts` regression guard imports the real `telegram` package directly and asserts `LAYER === 229` plus five layer-229 constructor IDs/exports, so any future drift back to layer 198 (e.g. a `telegram` version bump resetting `tl/static/`) fails CI loudly.

## Task Commits

Each task was committed atomically:

1. **Task 1: Vendor the layer-229 schema + update script** - `5077a9f` (feat)
2. **Task 2: Apply script — patch node_modules/telegram to layer 229, wire postinstall** - `52e3aa3` (feat)
3. **Task 3: Make TagClient layer-neutral + regression guard** - `c90a39a` (refactor)

**Plan metadata:** (added by orchestrator after this summary)

## Files Created/Modified

- `vendor/telegram-api.tl` - Git-tracked TDLib `telegram_api.tl` (layer 229), MTProto-core preamble lines stripped (3132 lines)
- `scripts/tl-update.mjs` - Fetches TDLib's current schema from `raw.githubusercontent.com/tdlib/td`, strips preamble, writes `vendor/telegram-api.tl` only
- `scripts/tl-apply.mjs` - Version-guards against `telegram@2.26.22`, writes `tl/static/api.tl` + reconstructs `tl/static/schema.tl`, regenerates via `generateModule.js`, bumps `LAYER` to 229 in `AllTLObjects.js`/`.d.ts`, sanity-boots the regenerated package; idempotent
- `package.json` - Added `tl:update`, `tl:apply`, and `postinstall` (→ `tl-apply.mjs`) scripts
- `README.md` - New "Developer: Updating the Telegram TL schema" section documenting the `tl:update` / `tl:apply` split
- `src/main/telegram/tagClient.ts` - Deleted patch-connect-restore LAYER mutation from `connect()`; rewrote module docblock and comments to reflect layer-neutral operation; zero `AllTLObjects` references remain
- `src/main/telegram/tagClient.test.ts` - Deleted the `AllTLObjects` mock and the three patch-connect-restore tests; simplified `makeMockInner()`; all other tests (governor routing, unparseable-response handling, disconnect, double-connect guard) unchanged and passing
- `src/main/telegram/tlLayer.test.ts` - New: real-package (unmocked) regression guard for `LAYER === 229` and five layer-229 constructor IDs/exports

## Decisions Made

None beyond what's in `key-decisions` above — plan executed as specified.

## Deviations from Plan

None - plan executed exactly as written. The live network fetch of TDLib's `telegram_api.tl` succeeded (3142 lines fetched, 3132 written after preamble-stripping), so the scratchpad fallback copy was not needed. The `gpg-agent` required a one-time restart (`gpgconf --kill gpg-agent`) mid-session to recover from a stale pinentry handle — an environment/tooling hiccup unrelated to the plan's scope, not a code change.

## Issues Encountered

- **gpg signing**: The first commit attempt failed with `gpg: signing failed: No pinentry`. Restarting `gpg-agent` (`gpgconf --kill gpg-agent`) resolved it; no signing was skipped or bypassed.
- **Pre-existing unrelated test failure**: `src/main/telegram/config.test.ts`'s two AUTH-03 tests (`API_ID is a positive integer`, `API_HASH is a non-empty string`) fail in this sandbox because `MRSPROPER_API_ID`/`MRSPROPER_API_HASH` secrets are not injected into the environment. Confirmed via `git stash` that this failure pre-exists independent of this plan's changes (unrelated to TL layer work) — out of scope per the deviation rules' scope boundary, not auto-fixed.

## User Setup Required

None - no external service configuration required. (Note: `MRSPROPER_API_ID`/`MRSPROPER_API_HASH` env vars are a pre-existing requirement for `config.test.ts` to pass locally/CI, unrelated to this plan.)

## Next Phase Readiness

`node_modules/telegram` is patched to layer 229 reproducibly on every `npm install` via `postinstall`. `TagClient` and the main client both now speak layer 229 natively — the `channelParticipant`/`channel` constructors that previously threw `TypeNotFoundError` should now deserialize correctly in production use. `TagExecutor.ts`'s module docblock and internal comments still reference the old "layer-224 isolation" architecture and "restore main client to layer 198" logic — this file was intentionally NOT touched (out of this plan's scope and explicitly excluded by the execution constraints); a follow-up plan should revisit `TagExecutor.ts`'s comments/logic now that the whole package runs at a single ambient layer and no per-connection layer juggling exists anywhere in the stack.

## Verification Output

```
$ node scripts/tl-apply.mjs && node scripts/tl-apply.mjs
tl-apply: AllTLObjects.LAYER = 229
tl-apply: Api.ChannelParticipant.CONSTRUCTOR_ID = 0x1bd54456
tl-apply: done — node_modules/telegram is now at TL layer 229
tl-apply: AllTLObjects.LAYER = 229
tl-apply: Api.ChannelParticipant.CONSTRUCTOR_ID = 0x1bd54456
tl-apply: done — node_modules/telegram is now at TL layer 229

$ grep -c "exports.LAYER = 229" node_modules/telegram/tl/AllTLObjects.js
1

$ npx tsc --build
(exit 0, no output)

$ npm test
 Test Files  1 failed | 32 passed (33)
      Tests  2 failed | 376 passed (378)
(the 2 failures are pre-existing AUTH-03 env-injection tests in
config.test.ts, unrelated to this plan — see "Issues Encountered")

$ npm run build
✓ built in ~1.4s (main, preload, renderer all succeeded)
```

---
*Phase: quick-261003-jni*
*Completed: 2026-10-03*

## Self-Check: PASSED

All created/modified files verified present on disk:
- FOUND: vendor/telegram-api.tl
- FOUND: scripts/tl-update.mjs
- FOUND: scripts/tl-apply.mjs
- FOUND: src/main/telegram/tlLayer.test.ts
- FOUND: src/main/telegram/tagClient.ts
- FOUND: src/main/telegram/tagClient.test.ts
- FOUND: .planning/quick/261003-jni-move-gramjs-client-to-tl-layer-229-schem/261003-jni-SUMMARY.md

All task commit hashes verified present in git log:
- FOUND: 5077a9f
- FOUND: 52e3aa3
- FOUND: c90a39a

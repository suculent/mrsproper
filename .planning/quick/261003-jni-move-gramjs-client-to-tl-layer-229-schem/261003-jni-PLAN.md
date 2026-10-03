---
phase: quick-261003-jni
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - vendor/telegram-api.tl
  - scripts/tl-update.mjs
  - scripts/tl-apply.mjs
  - package.json
  - README.md
  - src/main/telegram/tagClient.ts
  - src/main/telegram/tagClient.test.ts
  - src/main/telegram/tlLayer.test.ts
autonomous: true
requirements:
  - TL229-01
  - TL229-02
  - TL229-03
  - TL229-04
must_haves:
  truths:
    - "node scripts/tl-apply.mjs (equivalently npm run postinstall) rewrites node_modules/telegram's TL layer to 229 and regenerates apiTl.js/schemaTl.js/api.d.ts reproducibly from vendor/telegram-api.tl on every npm install"
    - "require('telegram/tl/AllTLObjects').LAYER === 229 after apply, and the participant/channel constructors MembershipScanner/ParticipantSearcher parse resolve to the layer-229 IDs (no more silent TypeNotFoundError)"
    - "TagClient.connect() no longer mutates any global LAYER — it connects at the ambient package layer (229) with no patch-connect-restore"
    - "npm run tl:update can re-fetch the latest TDLib schema into vendor/telegram-api.tl without touching node_modules, so a future layer bump is a vendor-file update + re-apply, not a new patch mechanism"
    - "npm test, npx tsc --build, and npm run build all pass after the schema swap"
  artifacts:
    - path: "vendor/telegram-api.tl"
      provides: "Layer-229 TL schema (TDLib telegram_api.tl, preamble lines stripped), vendored and git-tracked"
      min_lines: 1000
    - path: "scripts/tl-update.mjs"
      provides: "Fetches TDLib's telegram_api.tl, strips the fixed preamble lines, writes vendor/telegram-api.tl"
      contains: "raw.githubusercontent.com/tdlib/td"
    - path: "scripts/tl-apply.mjs"
      provides: "Applies vendor/telegram-api.tl into node_modules/telegram, regenerates apiTl.js/schemaTl.js/api.d.ts, bumps LAYER to 229; idempotent; fails loudly on version mismatch"
      contains: "2.26.22"
    - path: "src/main/telegram/tagClient.ts"
      provides: "Layer-neutral TagClient — no AllTLObjects require/mutation"
    - path: "src/main/telegram/tlLayer.test.ts"
      provides: "Regression guard asserting LAYER=229 and renumbered constructor IDs against the real telegram package"
      contains: "0x1bd54456"
  key_links:
    - from: "package.json#scripts.postinstall"
      to: "scripts/tl-apply.mjs"
      via: "npm install lifecycle hook"
      pattern: "\"postinstall\": \"node scripts/tl-apply.mjs\""
    - from: "scripts/tl-apply.mjs"
      to: "node_modules/telegram/tl/generateModule.js"
      via: "child_process invocation after writing tl/static/api.tl + tl/static/schema.tl"
      pattern: "generateModule"
    - from: "src/main/telegram/tlLayer.test.ts"
      to: "node_modules/telegram/tl/AllTLObjects"
      via: "direct (unmocked) import of the real package"
      pattern: "from 'telegram/tl/AllTLObjects'"
---

<objective>
Move the GramJS client from TL layer 198 to TL layer 229 by vendoring the current TDLib schema and reproducibly re-generating `node_modules/telegram`'s TL layer at install time, then delete the now-unnecessary per-connection LAYER patch hack in `TagClient` since the whole package — main client and tag client alike — now speaks layer 229 natively.

Purpose: Telegram's servers emit layer-229+ participant/channel constructors (`channelParticipant#1bd54456`, `channelParticipantSelf#a9478a1a`, `channelParticipantBanned#d5f0ad91`, `channel#d49f34c6`, all carrying `rank`). The installed `telegram@2.26.22` only knows layer 198's constructor IDs for these, so GramJS throws `TypeNotFoundError` and `MembershipScanner`/`ParticipantSearcher` silently fail to parse real responses.

Output: `vendor/telegram-api.tl` (git-tracked layer-229 schema) + `scripts/tl-update.mjs` (refresh the vendor file from upstream) + `scripts/tl-apply.mjs` (apply the vendor file into `node_modules/telegram`, wired as `postinstall`) + a layer-neutral `TagClient` + a regression test guarding the constructor IDs.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/main/telegram/tagClient.ts
@src/main/telegram/tagClient.test.ts
@src/main/telegram/tagApi.ts
@package.json

<!-- Proven offline (do not re-derive): background_facts from the orchestrator -->
<!-- - telegram@2.26.22 ships TL layer 198 (node_modules/telegram/tl/AllTLObjects.js: exports.LAYER = 198). -->
<!-- - GramJS builds Api classes at runtime from the string in node_modules/telegram/tl/apiTl.js. -->
<!-- - Swapping that string for the current TDLib schema (preamble-stripped) was proven offline: -->
<!--   all target constructors present, round-trip OK, editChatParticipantRank bytes match tagApi.ts exactly. -->
<!-- - Source: https://raw.githubusercontent.com/tdlib/td/master/td/generate/scheme/telegram_api.tl -->
<!--   (TDLib MTPROTO_LAYER = 229). A preamble-stripped copy already exists at: -->
<!--   /private/tmp/claude-501/-Users-igraczech-Repositories-MrProper/f2f73e99-08b8-4136-93c4-2d05aafee31d/scratchpad/api-229.tl -->
<!--   — usable directly as the initial vendor/telegram-api.tl content if a live fetch is unavailable. -->

<interfaces>
<!-- Exact shapes the executor needs — do not re-explore node_modules/telegram. -->

From node_modules/telegram/tl/generateModule.js (unmodified, DO NOT edit this file — invoke it, don't rewrite it):
```
require("./types-generator/generate");   // runs first: writes ../api.d.ts from ../static/api.tl + ../static/schema.tl
function main() {
  const apiTl = fs.readFileSync(path.resolve(__dirname, `./static/api.tl`), "utf-8");
  fs.writeFileSync(path.resolve(__dirname, "./apiTl.js"), `module.exports = \`${stripTl(apiTl)}\`;`);
  const schemaTl = fs.readFileSync(path.resolve(__dirname, `./static/schema.tl`), "utf-8");
  fs.writeFileSync(path.resolve(__dirname, "./schemaTl.js"), `module.exports = \`${stripTl(schemaTl)}\`;`);
}
function stripTl(tl) {
  return tl.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "").replace(/\n\s*\n/g, "\n").replace(/`/g, "\\`");
}
main();
```
Running `node node_modules/telegram/tl/generateModule.js` (no args) regenerates `tl/api.d.ts`, `tl/apiTl.js`, and `tl/schemaTl.js` from whatever is currently in `tl/static/api.tl` and `tl/static/schema.tl` — it reads, never fetches. `tl/static/` is NOT shipped in the npm tarball, so both files must be (re)created before this runs.

From node_modules/telegram/tl/AllTLObjects.js (current, layer 198):
```
exports.LAYER = 198;
```
From node_modules/telegram/tl/AllTLObjects.d.ts (current, layer 198):
```
export declare const LAYER = 198;
```
Both are plain numeric-literal lines in compiled/typed output (no `.ts` source ships in the package) — a textual replace of the digits is the only way to bump them; `generateModule.js` does NOT touch this file.

From node_modules/telegram/tl/schemaTl.js (current — this is the MTProto core schema, NOT layer-dependent, so its content does not change; only its on-disk `static/schema.tl` form needs to be reconstructed for generateModule.js to read):
```
module.exports = `
resPQ#05162463 nonce:int128 server_nonce:int128 pq:string server_public_key_fingerprints:Vector<long> = ResPQ;
...
`;
```
The reverse of `stripTl`'s backtick-escaping is: take everything between the first `` ` `` after `module.exports = ` and the final `` ` ``, then replace every `` \` `` with `` ` ``.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Vendor the layer-229 schema + update script</name>
  <files>vendor/telegram-api.tl, scripts/tl-update.mjs, package.json, README.md</files>
  <action>
Create `vendor/telegram-api.tl` and the script that (re)produces it, per TL229-01.

Write `scripts/tl-update.mjs` as a standalone Node ESM script (repo already uses Node 22 / `.mjs` ad-hoc scripts, see `scripts/spike-member-tag.mjs` for the house style of a header comment block explaining purpose/usage). It must:
- Fetch `https://raw.githubusercontent.com/tdlib/td/master/td/generate/scheme/telegram_api.tl` using the global `fetch` (Node 22 has it built in — no new dependency). On a non-2xx response or network error, print a clear error naming the URL and `process.exit(1)`.
- Split the fetched text into lines. Drop any line whose trimmed content exactly equals one of: `int ? = Int;`, `long ? = Long;`, `double ? = Double;`, `string ? = String;`, `bytes = Bytes;`, `int256 = Int256;`. Also drop any line whose trimmed content starts with one of: `ipPort#`, `ipPortSecret#`, `accessPointRule#`, `help.configSimple#`.
- Join the remaining lines with `\n`, ensure a single trailing newline, and write the result to `vendor/telegram-api.tl` (create the `vendor/` directory if absent).
- Print a one-line summary: input line count, output line count, output path.
- No other side effects — this script never touches `node_modules/`.

Add `"tl:update": "node scripts/tl-update.mjs"` to `package.json`'s `"scripts"` block (keep existing scripts untouched, alphabetical position not required — append is fine).

Run `node scripts/tl-update.mjs` now to produce the real `vendor/telegram-api.tl`. If the sandbox has no network access and the fetch fails, instead copy the content of `/private/tmp/claude-501/-Users-igraczech-Repositories-MrProper/f2f73e99-08b8-4136-93c4-2d05aafee31d/scratchpad/api-229.tl` to `vendor/telegram-api.tl` (that file was produced from the same upstream URL with the same preamble rules and is the proven-working offline test fixture) — but still attempt the live fetch first or immediately after, and if it succeeds, prefer its output; only fall back to the scratchpad copy if the network is genuinely unavailable in this environment.

Finally, append a new `## Developer: Updating the Telegram TL schema` section to the end of `README.md` (after the existing `## Technical Note` section) documenting: `npm run tl:update` re-fetches TDLib's current `telegram_api.tl`, strips the fixed MTProto-core preamble lines, and overwrites `vendor/telegram-api.tl`; this is a release-time step (run it, review the diff, commit it) — it does NOT touch `node_modules/telegram` by itself (that's `npm run tl:apply` / the `postinstall` hook, added in the next task).
  </action>
  <verify>
    <automated>test -s vendor/telegram-api.tl && [ "$(wc -l < vendor/telegram-api.tl)" -gt 1000 ] && [ "$(grep -c '^int ? = Int;' vendor/telegram-api.tl)" -eq 0 ] && [ "$(grep -c '^ipPort#' vendor/telegram-api.tl)" -eq 0 ] && [ "$(grep -c 'editChatParticipantRank#a00f32b0' vendor/telegram-api.tl)" -eq 1 ] && grep -q '"tl:update"' package.json && grep -q 'tl:update' README.md && echo PASS</automated>
  </verify>
  <done>
`vendor/telegram-api.tl` exists, is git-trackable, is preamble-stripped (no `int ? = Int;`-style core-type lines, no `ipPort#`/`ipPortSecret#`/`accessPointRule#`/`help.configSimple#` lines), is over 1000 lines, and contains the known `editChatParticipantRank#a00f32b0` constructor as a sanity anchor. `scripts/tl-update.mjs` exists, fetches from the TDLib raw URL, applies the exact preamble-strip rules, and writes only to `vendor/telegram-api.tl` (never touches `node_modules/`). `package.json` has a `tl:update` script. `README.md` documents `npm run tl:update` as a release-time step.
  </done>
</task>

<task type="auto">
  <name>Task 2: Apply script — patch node_modules/telegram to layer 229, wire postinstall</name>
  <files>scripts/tl-apply.mjs, package.json, node_modules/telegram/tl/static/api.tl, node_modules/telegram/tl/static/schema.tl, node_modules/telegram/tl/apiTl.js, node_modules/telegram/tl/schemaTl.js, node_modules/telegram/tl/api.d.ts, node_modules/telegram/tl/AllTLObjects.js, node_modules/telegram/tl/AllTLObjects.d.ts</files>
  <action>
Create `scripts/tl-apply.mjs` per TL229-02 — the script that makes the vendored schema real inside the installed package, reproducibly on every `npm install`. Use the exact mechanics proven offline in `schema-swap-test.cjs` and documented in the `<interfaces>` block above; do not invent a different swap mechanism (e.g. do NOT reimplement `stripTl` by hand when `generateModule.js` already does it correctly — invoke that file, don't duplicate it).

Script steps, in order, each failing loudly (non-zero exit + descriptive message) on error — this is a `postinstall` hook, so silent partial failure is worse than a hard stop:

1. **Version guard.** Read and `JSON.parse` `node_modules/telegram/package.json`. If `version !== '2.26.22'`, print an error naming the found version and instructing to review `scripts/tl-apply.mjs` compatibility before proceeding, then `process.exit(1)`. This prevents the patch silently mis-applying against a future GramJS release with a different internal layout.
2. **Ensure static dir.** `fs.mkdirSync(path.join(telegramPkgDir, 'tl/static'), { recursive: true })`.
3. **Write api.tl.** Copy `vendor/telegram-api.tl` (resolved from the repo root, not relative to the package) verbatim to `node_modules/telegram/tl/static/api.tl`.
4. **Reconstruct schema.tl.** Read `node_modules/telegram/tl/schemaTl.js` as text. It is always of the exact form `module.exports = \`...\`;` (optionally with a trailing newline) with internal backticks escaped as `` \` ``. Extract the content between the first backtick and the last backtick in the file (a non-greedy-safe approach: find the first `` ` `` character, find the LAST `` ` `` character, slice between them), then replace every `` \` `` with `` ` ``. Write the result to `node_modules/telegram/tl/static/schema.tl`. (This file's content is the MTProto core schema and does not change between layers — this step only reconstructs the `.tl` form the generator expects to read, since `tl/static/` ships in neither the npm tarball nor git.)
5. **Regenerate.** Run `node_modules/telegram/tl/generateModule.js` as a child process: `execFileSync(process.execPath, [path.join(telegramPkgDir, 'tl/generateModule.js')], { stdio: 'inherit' })`. This internally re-runs `types-generator/generate.js` first (rewrites `tl/api.d.ts` from the two static files) and then rewrites `tl/apiTl.js` + `tl/schemaTl.js` from them via the package's own `stripTl()`.
6. **Bump LAYER in AllTLObjects.js.** Read `node_modules/telegram/tl/AllTLObjects.js` as text. Replace the pattern `exports.LAYER = <digits>;` with `exports.LAYER = 229;` using a regex (`/exports\.LAYER = \d+;/`). Before writing, assert the regex matched at least once (`String.prototype.match`); if it did not match, throw — do not write a file where the replace silently no-op'd. Write the file back.
7. **Bump LAYER in AllTLObjects.d.ts.** Same pattern against `export declare const LAYER = <digits>;` in `node_modules/telegram/tl/AllTLObjects.d.ts`, replacing with `export declare const LAYER = 229;`, same match-count assertion.
8. **Sanity boot.** `require()` the freshly-regenerated package fresh (a short-lived child script run via `execFileSync(process.execPath, ['-e', '...'])`, or inline since this script itself is a one-shot process with a clean require cache) and print `AllTLObjects.LAYER` and `Api.ChannelParticipant.CONSTRUCTOR_ID` (as hex) to stdout. If this require throws, let the script exit non-zero with the real error — this catches a corrupt regeneration before it reaches a developer's `npm test`.

**Idempotency requirement:** running `node scripts/tl-apply.mjs` twice in a row must succeed both times and leave the package in the same end state. The LAYER regex in steps 6–7 must match regardless of whether the current value is `198` or already `229` (digit-class regex, not a literal `198` match). Steps 3–5 are naturally idempotent (deterministic output from the same static inputs).

Add to `package.json` `"scripts"`: `"postinstall": "node scripts/tl-apply.mjs"` and `"tl:apply": "node scripts/tl-apply.mjs"` (same command; `tl:apply` is an explicit alias for manually re-running after a branch switch without a fresh `npm install`).

Run `node scripts/tl-apply.mjs` now so `node_modules/telegram` carries layer 229 for the rest of this plan's tasks and verification.
  </action>
  <verify>
    <automated>node scripts/tl-apply.mjs && node scripts/tl-apply.mjs && node -e "const a=require('telegram/tl/AllTLObjects'); const {Api}=require('telegram'); if(a.LAYER!==229) throw new Error('LAYER not 229: '+a.LAYER); if(Api.ChannelParticipant.CONSTRUCTOR_ID!==0x1bd54456) throw new Error('bad ctor'); console.log('PASS')" && [ "$(grep -c 'exports.LAYER = 229' node_modules/telegram/tl/AllTLObjects.js)" -eq 1 ]</automated>
  </verify>
  <done>
`scripts/tl-apply.mjs` exists, exits 0 on two consecutive runs (idempotent), and exits 1 with a clear message if `node_modules/telegram`'s version is not `2.26.22`. `package.json` has `postinstall` and `tl:apply` scripts both running this file. After running it, `require('telegram/tl/AllTLObjects').LAYER === 229`, `Api.ChannelParticipant.CONSTRUCTOR_ID === 0x1bd54456`, and `node_modules/telegram/tl/AllTLObjects.js` contains exactly one `exports.LAYER = 229` line.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Make TagClient layer-neutral + regression guard</name>
  <files>src/main/telegram/tagClient.ts, src/main/telegram/tagClient.test.ts, src/main/telegram/tlLayer.test.ts</files>
  <behavior>
    - tagClient.test.ts (updated): connect() calls innerClient.connect() exactly once and never touches any LAYER global — the three `patch-connect-restore: AllTLObjects.LAYER` tests (restore-after-resolve, 224-at-call-time, restore-on-throw) are deleted outright, not adapted, because the behavior they tested (per-call LAYER mutation) no longer exists.
    - tagClient.test.ts (unchanged behavior, must still pass): invoke() routes through governor.run(); governor.run() wraps innerClient.invoke() with the request; the unparseable-response catch still treats a TypeNotFoundError-shaped error as success and still rethrows a genuine RPCError; disconnect() calls innerClient.disconnect() once; a second concurrent connect() still throws 'TagClient: connect() already in progress'.
    - tlLayer.test.ts (new): require('telegram/tl/AllTLObjects').LAYER === 229; Api.ChannelParticipant.CONSTRUCTOR_ID === 0x1bd54456; Api.ChannelParticipantSelf.CONSTRUCTOR_ID === 0xa9478a1a; Api.ChannelParticipantBanned.CONSTRUCTOR_ID === 0xd5f0ad91; Api.messages.EditChatParticipantRank.CONSTRUCTOR_ID === 0xa00f32b0; Api.channels.InviteToChannel and Api.messages.InvitedUsers are both defined.
  </behavior>
  <action>
Per TL229-03: in `src/main/telegram/tagClient.ts`, delete the patch-connect-restore mechanism from `connect()` entirely. The new `connect()` body keeps the `_connecting` double-connect guard (still a valid, independent protection) but removes every line touching `AllTLObjects`/`LAYER`/`prevLayer`/`224`: it becomes a plain `if (this._connecting) throw ...; this._connecting = true; try { await this._inner.connect() } finally { this._connecting = false }`. Delete the `require('telegram/tl/AllTLObjects')` call and the `prevLayer` capture entirely — there is nothing left to read or restore.

Keep `isUnparseableUpdatesResponse()` and the governor-routed `invoke()` method exactly as they are today (same logic, same error classification) — only update the comment above `invoke()` to drop the "layer-224 Updates... layer-198 deserializer" framing and instead note this fallback is retained defensively for any future unparseable response, independent of layer (the client now runs at the package's ambient global layer, 229, set once by `scripts/tl-apply.mjs`, not patched per-connection).

Rewrite the module docblock at the top of the file: remove the "layer-224 isolated connection helper", "patch-connect-restore", and "LOCKED — proven by Phase 0 spike" framing tied to the old mechanism. Replace with: `TagClient` is an isolated connection wrapper (separate from the main client, same `StringSession`) that routes all invokes through the shared `RateLimitGovernor`; it no longer mutates any global TL layer because the whole package now runs at layer 229 (via `scripts/tl-apply.mjs`, see `vendor/telegram-api.tl`), so `editChatParticipantRank`'s layer-229 constructors deserialize normally through the main deserializer. Keep the write-only guidance ("do NOT invoke getDialogs/getParticipants on this client") and the `_connecting` guard explanation, reworded to drop the LAYER-mutation framing.

In `src/main/telegram/tagClient.test.ts`: delete the top-level `vi.mock('telegram/tl/AllTLObjects', () => ({ LAYER: 198 }))` line. Delete the entire `describe('patch-connect-restore: AllTLObjects.LAYER', ...)` block (all three tests). Simplify `makeMockInner()`: remove the `LayerSnapshot` type, the `connectLayerSeen` object, and the `require('telegram/tl/AllTLObjects')` read inside the mock `connect` callback — `connect` becomes a plain `vi.fn(async () => { if (opts?.connectNeverResolves) return new Promise(() => {}); if (opts?.connectImpl) return opts.connectImpl() })`, and the function no longer returns `connectLayerSeen`. Update every call site that destructured `connectLayerSeen` off the mock (there should be none left once the deleted describe block is gone — confirm via a search of the file). Leave every other `describe` block (`invoke() governor routing`, `invoke() — layer-224 unparseable response = write accepted`, `disconnect()`, `double-connect guard`) exactly as-is; the describe/it labels mentioning "layer-224" in that unparseable-response block's comments may stay or be lightly reworded to "layer-229" since the mechanism it documents (catching a TypeNotFoundError-shaped error as an accepted write) is unchanged and still correct — only the number in the comment is stale, not the test logic.

Create `src/main/telegram/tlLayer.test.ts` per TL229-04: a plain Vitest file that imports the REAL `telegram` package directly — `import { Api } from 'telegram'` and `import { LAYER } from 'telegram/tl/AllTLObjects'` — not through any mock. Confirm first (by reading `vitest.config.ts` and `src/main/telegram/__mocks__/`) that nothing in this directory globally intercepts bare `telegram` imports via Vitest's automatic `__mocks__` resolution or a `vi.mock('telegram', ...)` call at another file's module scope that could leak; `src/main/telegram/__mocks__/telegramClient.ts` is a hand-built class injected via constructor options elsewhere (not a Vitest module mock for the `telegram` package itself), and `tagClient.test.ts`'s `vi.mock('telegram/tl/AllTLObjects', ...)` is file-scoped to that test file only, so this new test file's imports resolve to the real, `tl-apply.mjs`-patched package. Add one `describe('telegram package TL layer', ...)` with individual `it(...)` assertions for each value listed in `<behavior>` above, plus a comment explaining this test exists to catch `node_modules/telegram` drifting back to layer 198 (e.g. `npm install` run without the `postinstall` hook firing, or a future `telegram` version bump resetting `tl/static/`).
  </action>
  <verify>
    <automated>npx vitest run src/main/telegram/tagClient.test.ts src/main/telegram/tlLayer.test.ts && [ "$(grep -c 'AllTLObjects' src/main/telegram/tagClient.ts)" -eq 0 ]</automated>
  </verify>
  <done>
`tagClient.ts` contains zero references to `AllTLObjects` anywhere (code or comments); `connect()` is a plain `try/finally` around `this._inner.connect()` guarded only by `_connecting`. `tagClient.test.ts` no longer mocks `telegram/tl/AllTLObjects` and no longer asserts any LAYER value; all remaining tests (governor routing, unparseable-response handling, disconnect, double-connect guard) pass unchanged. `tlLayer.test.ts` exists, imports the real `telegram` package, and passes, confirming `LAYER === 229` and all five listed constructor/export checks.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| `scripts/tl-update.mjs` → github.com | Fetches a third-party schema file (TDLib's `telegram_api.tl`) over HTTPS; this text is later compiled into the production TL object model |
| `npm install` → `scripts/tl-apply.mjs` (postinstall) | Runs automatically, unattended, on every contributor's and CI's `npm install`, mutating files inside `node_modules/telegram` |
| `scripts/tl-apply.mjs` → `node_modules/telegram/tl/generateModule.js` | Executes code shipped inside an already-installed third-party dependency via `child_process` |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-jni-01 | Tampering/Spoofing | `tl-update.mjs` fetch of TDLib's `telegram_api.tl` over HTTPS | mitigate | Fetch is TLS (`https://raw.githubusercontent.com`); the script only ever writes to the git-tracked `vendor/telegram-api.tl`, never directly to `node_modules` — a bad/compromised fetch is caught by normal code review of the resulting git diff before anyone runs `tl:apply` |
| T-jni-02 | Tampering | `postinstall` auto-mutates `node_modules/telegram` on every install (all contributors + CI) | mitigate | `tl-apply.mjs` only ever writes bytes derived from the git-reviewed `vendor/telegram-api.tl` plus the package's own existing `schemaTl.js`; it hard-fails (`process.exit(1)`) unless `node_modules/telegram/package.json` version is exactly `2.26.22`, preventing silent drift onto an unreviewed GramJS release |
| T-jni-03 | Tampering | `tl-apply.mjs` invokes `node_modules/telegram/tl/generateModule.js` via `child_process`, running code from the installed dependency | accept | `generateModule.js` ships inside the already-trusted, version-pinned `telegram` dependency already present in `package.json`; no new dependency or install surface is introduced by this plan |
| T-jni-04 | Tampering/Integrity | Regex-based LAYER bump in `AllTLObjects.js`/`.d.ts` could silently no-op if GramJS's internal format changes | mitigate | `tl-apply.mjs` asserts the replace regex matched at least once before writing, and the `<verify>` steps assert `grep -c "exports.LAYER = 229"` equals exactly 1 after the run, failing the task rather than shipping a package still on layer 198 |

No npm/pip/cargo package install is introduced by this plan (no new `dependencies`/`devDependencies` entries) — the Package Legitimacy Gate does not apply.
</threat_model>

<verification>
Run in order from the repo root:

1. `node scripts/tl-apply.mjs` (equivalently `npm run postinstall`) — exits 0, idempotent on a second run.
2. `grep -c "exports.LAYER = 229" node_modules/telegram/tl/AllTLObjects.js` — must print `1`.
3. `npx tsc --build` — the real typecheck (per project memory, root `tsc --noEmit` is a no-op; `tsc --build` is the actual check). Must exit 0.
4. `npm test` — all Vitest suites pass, including the updated `tagClient.test.ts` and new `tlLayer.test.ts`.
5. `npm run build` — electron-vite build succeeds, confirming the `externalizeDepsPlugin`'d `telegram` dependency still resolves and the packaged app will load the patched `node_modules/telegram` at runtime (per `electron-builder.yml`'s note that `node_modules` is bundled into the asar, not excluded).
</verification>

<success_criteria>
- `node_modules/telegram/tl/AllTLObjects.js` reports `LAYER = 229` after `node scripts/tl-apply.mjs`, reproducibly across repeated runs and fresh `npm install`s (via the `postinstall` hook).
- `Api.ChannelParticipant`, `Api.ChannelParticipantSelf`, `Api.ChannelParticipantBanned`, and `Api.messages.EditChatParticipantRank` resolve to the layer-229 constructor IDs (`0x1bd54456`, `0xa9478a1a`, `0xd5f0ad91`, `0xa00f32b0` respectively).
- `src/main/telegram/tagClient.ts` contains no `AllTLObjects` reference of any kind.
- `npm run tl:update` refreshes `vendor/telegram-api.tl` from upstream TDLib without touching `node_modules`.
- `npx tsc --build`, `npm test`, and `npm run build` all pass.
</success_criteria>

<output>
Create `.planning/quick/261003-jni-move-gramjs-client-to-tl-layer-229-schem/261003-jni-SUMMARY.md` when done.
</output>

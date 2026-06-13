---
phase: 07-packaging-signing-release
reviewed: 2026-06-12T21:49:34Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - .env.example
  - README.md
  - build/entitlements.mac.plist
  - electron-builder.yml
  - package.json
  - scripts/release.sh
findings:
  critical: 0
  warning: 5
  info: 6
  total: 11
status: issues_found
---

# Phase 7: Code Review Report

**Reviewed:** 2026-06-12T21:49:34Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Reviewed the Phase 7 packaging/signing/release surface: the release orchestration
script, electron-builder config, hardened-runtime entitlements, env template,
README, and package.json. Cross-checks performed during review: `.env` is
correctly gitignored; `build/icon.png`, `build/icon-win.png`, and
`build/entitlements.mac.plist` exist; the `typecheck` script runs successfully
against the composite `tsconfig.node.json`; build-time credential injection is
confirmed in `electron.vite.config.ts` (loads `.env` via dotenv, defines
`import.meta.env.MRSPROPER_*`).

No Critical findings. Five Warnings: a silent-failure path in the DMG
notarization error handling, artifact-collection globs that can ship stale or
missing Windows binaries without failing, two hardened-runtime entitlements
broader than Electron requires, a verified-broken credentials path in
`.env.example`, and a release gate that never runs the test suite.

## Warnings

### WR-01: notarize_dmg dies silently when notarytool exits non-zero — error handling is unreachable in that case

**File:** `scripts/release.sh:84-95`
**Issue:** The script runs under `set -euo pipefail`. In `notarize_dmg`, the
notarytool output is captured with a bare assignment:

```bash
output=$(xcrun notarytool submit "${dmg}" ... --wait 2>&1)
```

A plain assignment propagates the command-substitution exit status, so if
`notarytool` exits non-zero (bad credentials, network failure, expired .p8 key),
`set -e` aborts the script **on this line** — before `echo "${output}"` runs.
Because stdout+stderr were captured into the variable, the operator sees the
script terminate with **no notarytool output at all** and never reaches the
diagnostic message about `xcrun notarytool log`. The carefully written error
block on lines 91–95 only executes in the case where notarytool exits 0 but
reports a non-Accepted status; the non-zero-exit case bypasses it entirely.
**Fix:**
```bash
local output rc=0
output=$(xcrun notarytool submit "${dmg}" \
  --key "$APPLE_API_KEY" \
  --key-id "$APPLE_API_KEY_ID" \
  --issuer "$APPLE_API_ISSUER" \
  --wait 2>&1) || rc=$?
echo "${output}"
if [[ $rc -ne 0 ]] || ! echo "${output}" | grep -q "status: Accepted"; then
  echo "ERROR: notarytool failed (exit ${rc}) or did not return 'status: Accepted' for ${dmg}"
  echo "Check submission log with: xcrun notarytool log <submission-id>"
  exit 1
fi
```

### WR-02: Windows artifact collection can silently ship stale versions or nothing at all

**File:** `scripts/release.sh:116-123`
**Issue:** Two compounding problems:

1. The globs are not version-pinned: `release/MrsProper*Setup*.exe` and
   `release/MrsProper*portable*.exe` match artifacts from **previous releases**
   left in `release/` (the script never cleans `release/` or `release/dist/`,
   and electron-builder does not remove old-version artifacts). Re-running for
   0.9.1 after a 0.9.0 release copies both `MrsProper Setup 0.9.0.exe` and
   `MrsProper Setup 0.9.1.exe` into `release/dist/`, inviting distribution of
   the wrong binary.
2. `2>/dev/null || true` masks total absence: if the Windows artifacts are
   missing (renamed artifact pattern, partial wine failure that left exit 0
   output dirs), the script still prints "Release artifacts in release/dist/"
   and exits 0 with no Windows binaries — a release that "succeeds" while
   incomplete.

The exact artifact names are known (`portable.artifactName` is configured;
NSIS default is `${productName} Setup ${version}.exe`), so globbing and
failure-masking are both unnecessary.
**Fix:**
```bash
rm -rf release/dist && mkdir -p release/dist
cp "release/MrsProper-${VERSION}-arm64.dmg" "release/dist/"
cp "release/MrsProper-${VERSION}.dmg" "release/dist/"
cp "release/MrsProper Setup ${VERSION}.exe" "release/dist/"
cp "release/MrsProper-${VERSION}-portable.exe" "release/dist/"
```
(Each `cp` now fails loudly under `set -e` if an expected artifact is missing.)

### WR-03: Hardened-runtime entitlements are broader than Electron requires

**File:** `build/entitlements.mac.plist:8-12`
**Issue:** Two of the three granted entitlements weaken the hardened runtime
beyond what this app needs:

- `com.apple.security.cs.allow-unsigned-executable-memory` — per Electron's own
  guidance, only `allow-jit` is required for Electron ≥ 12 (V8 uses MAP_JIT).
  The linked electron-notarize prerequisites doc predates that change.
- `com.apple.security.cs.disable-library-validation` — disables the check that
  loaded dylibs/native modules are signed by the same team or Apple. The only
  native modules (`bufferutil`, `utf-8-validate` N-API prebuilds) are signed by
  electron-builder during the deep-sign pass, so library validation should pass
  without this. Disabling it allows any unsigned/foreign-signed library to be
  injected into a process that holds a live Telegram session.

For an app whose threat model explicitly includes "a leaked session is full
account access" (CLAUDE.md security constraint), the entitlement set should be
minimal.
**Fix:** Remove both keys, leaving only `allow-jit`; rebuild and verify launch +
GramJS connect on both arches. If the packaged app crashes loading the prebuilt
`.node` files, re-add **only** `disable-library-validation` with a comment
documenting the observed failure.

### WR-04: .env.example points operators to a nonexistent credentials path

**File:** `.env.example:4`
**Issue:** The instruction for obtaining `MRSPROPER_API_ID`/`MRSPROPER_API_HASH`
references:

```
~/.claude/projects/-Users-igraczech-Repositories-MrsProper/memory/telegram-api-credentials.md
```

That directory does not exist (verified). The repository directory is
`MrProper`, so the actual memory path is
`~/.claude/projects/-Users-igraczech-Repositories-MrProper/memory/telegram-api-credentials.md`
(verified to exist). An operator following the template hits a dead path, and
the release script's pre-flight then blocks on empty `MRSPROPER_API_*` values
with no working pointer to the credentials.
**Fix:** Correct `MrsProper` → `MrProper` in the path on line 4.

### WR-05: Release script gates on typecheck but never runs the test suite

**File:** `scripts/release.sh:47-56`
**Issue:** The script is the release gate (version bump → typecheck → build →
sign → notarize → collect artifacts), yet it never executes `npm run test`
despite a configured vitest suite (`package.json:14`). A release can be built,
signed, notarized, and staged for distribution from a commit with failing tests
— the only correctness gate is the type checker. For a tool performing
destructive bulk bans, the test suite is the cheapest pre-release safety net
available.
**Fix:** Add after the typecheck gate:
```bash
echo "Running tests..."
npm run test
```

## Info

### IN-01: Shipping EOL Electron 37 (Chromium 138) — accepted risk, needs a revisit trigger

**File:** `README.md:43-46`, `package.json:52`
**Issue:** Electron 37.10.3 is past EOL (January 2026); Chromium 138 receives no
further security patches. This is a deliberate, documented decision (D-16, Big
Sur support) and is mitigated by the renderer loading only local content with a
strict CSP (`connect-src 'none'`), so it is not flagged as a defect. However,
nothing records when/whether to revisit (e.g., when Big Sur support is dropped
or a relevant Chromium/Node CVE lands that is exploitable via local content or
the main process).
**Fix:** Add a revisit condition to the D-16 note (e.g., "re-evaluate at v1.x
when Big Sur usage ends, or immediately upon a main-process-relevant Electron 37
CVE").

### IN-02: `typecheck` script only covers the node project; renderer is unchecked

**File:** `package.json:16`
**Issue:** `tsc --noEmit -p tsconfig.node.json` checks main/preload/shared but
not `tsconfig.web.json` (renderer). The release script correctly uses
`tsc --build --force` (full coverage via root references), so the release path
is safe — but anyone using `npm run typecheck` during development gets partial
coverage and a false sense of a clean check.
**Fix:** `"typecheck": "tsc --build --force"` (matches the documented
tsc-noop pitfall guidance and the release script).

### IN-03: Comment claims `LSMinimumSystemVersion: 11.0` but no config key sets it

**File:** `electron-builder.yml:2,35`
**Issue:** Two comments state "LSMinimumSystemVersion: 11.0 (Big Sur+) per
D-16", but the config never sets that plist key — the value is inherited from
Electron 37's bundled Info.plist. That happens to be 11.0 today, but the comment
implies an enforced setting that does not exist; an Electron bump would silently
change the floor while the comment still claims 11.0.
**Fix:** Either pin it explicitly under `mac.extendInfo`
(`LSMinimumSystemVersion: "11.0"`) or reword the comments to "derived from
Electron 37's Info.plist (11.0)".

### IN-04: README points end users at an internal planning artifact

**File:** `README.md:46`
**Issue:** The user-facing README references
`.planning/phases/07-packaging-signing-release/07-CONTEXT.md`. Users who receive
only the DMG/exe (or a published README) cannot resolve that path; it is an
internal-only reference inside the distribution-facing doc.
**Fix:** Drop the path from the README (keep the D-16 rationale sentence), or
move the Technical Note to an internal doc.

### IN-05: release.sh assumes it is run from the repo root

**File:** `scripts/release.sh:17,100-123`
**Issue:** All paths (`.env`, `release/...`) are relative to the cwd, not the
script location. Run from elsewhere it usually fails closed on the `.env` check
— but if the cwd happens to contain its own `.env` (another project), the script
sources foreign credentials before failing later with a confusing error.
**Fix:** Add near the top: `cd "$(dirname "$0")/.."`

### IN-06: Version bump happens before any gates run

**File:** `scripts/release.sh:39`
**Issue:** `npm version` mutates `package.json` before typecheck/build/package
gates. If any gate fails, the working tree is left with an uncommitted version
bump. Re-running is harmless thanks to `--allow-same-version`, but a failed run
leaves dirty state that can be accidentally committed with unrelated work.
**Fix:** Move the `npm version` call after the typecheck (and test) gates, just
before `npm run build`.

---

_Reviewed: 2026-06-12T21:49:34Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

# Phase 7: Packaging, Signing & Release - Research

**Researched:** 2026-06-12 (updated with Big Sur downgrade research)
**Domain:** Electron code signing, macOS notarization, Windows cross-build, release scripting, macOS 11 Big Sur compatibility
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Sign with the user's existing Apple Developer Program membership (Developer ID Application certificate). Signing is IN scope, not deferred.
- **D-02:** Notarize via an **App Store Connect API key (.p8)** — not Apple ID + app-specific password. Credentials follow the existing gitignored `.env` pattern.
- **D-03:** Mac artifacts: **separate x64 and arm64 DMGs** — NOT a universal binary.
- **D-04:** **DMG only** — remove the zip targets from electron-builder.yml.
- **D-05:** Windows code signing is **DEFERRED**. Ship unsigned; SmartScreen "More info → Run anyway" is the accepted v1 experience.
- **D-06:** Ship **both** the NSIS installer and the portable .exe.
- **D-07:** Windows artifacts are **cross-built from the dev Mac** (`npm run package:win`). The Windows VM is for verification only.
- **D-08:** SmartScreen run-anyway instructions live in release notes + README. No dedicated install guide.
- **D-09:** **Local scripted release** on the dev Mac: one script/checklist covering build → sign → notarize → collect artifacts. No CI.
- **D-10:** Distribution is **direct share** (Drive/Telegram/USB) to known admins. No GitHub Releases.
- **D-11:** Version: bump package.json to **0.9.x release candidate**. Bump to 1.0.0 only after clean-machine UAT passes.
- **D-12:** Auto-update is OUT — deferred.
- **D-13:** Verification matrix: **ARM Mac (Apple Silicon) + Intel Mac + macOS 11.7.10 Big Sur Mac + Windows VM**. The Big Sur machine is a REQUIRED matrix entry — it belongs to the primary admin the app is being built for.
- **D-14:** Verification depth: **launch + login smoke** — app opens, Telegram login reaches the code-entry step.
- **D-15:** Recording is informal — the user runs the checks and confirms back.
- **D-16:** The app MUST run on macOS 11.7.10 Big Sur. This phase MUST downgrade Electron from 42 to the newest version whose macOS minimum is ≤ 11. **Research conclusion: downgrade to Electron 37.10.3.**

### Claude's Discretion
- Hardened-runtime entitlements for Electron notarization (allow-jit etc.), electron-builder notarize config shape, and signing env-var names.
- Release script form (shell script vs npm script chain) and artifact collection layout.
- How "clean" Gatekeeper verification is performed (quarantine attribute handling, `spctl`/`stapler` checks before manual testing).
- Exact RC version number (0.9.0 vs continuing a 0.9.x line).

### Deferred Ideas (OUT OF SCOPE)
- Windows code signing (Azure Trusted Signing ~$10/mo was the preferred future option).
- GitHub Actions release pipeline.
- Auto-update via electron-updater.
- Hosted download page (GitHub Releases or corpus.cz).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| APP-03 | macOS build is code-signed and notarized; Windows build is code-signed (launches without Gatekeeper/SmartScreen blocking) | macOS: Developer ID cert + notarytool via electron-builder 26 built-in. Windows: deferred per D-05 — ship unsigned with documented "More info → Run anyway" flow. |
</phase_requirements>

---

## Summary

Phase 7 converts the existing unsigned electron-builder config into signed, notarized macOS DMGs and unsigned-but-distributable Windows installers. All tools required are already installed on the dev machine: electron-builder 26.15.2 (with bundled @electron/notarize 2.5.0), xcrun notarytool 1.1.2, the Developer ID Application certificate for Matej Sychra (team ID: 8VN6AYV2LV), and Wine 11.0 for Windows cross-builds.

The signing and notarization flow in electron-builder 26 is almost entirely env-var-driven. The yml changes are minimal: remove `identity: null` (or set it to the cert name), remove the `zip` targets, create `build/entitlements.mac.plist` with the three Electron-required entitlements, and extend `.env.example` with the four notarization env vars. electron-builder's `notarizeIfProvided` automatically runs after signing when `APPLE_API_KEY`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER` are set and `notarize` is not explicitly `false` in the mac config.

**SCOPE CHANGE — Big Sur requirement (D-16):** The primary admin cannot upgrade beyond macOS 11.7.10. Electron 42 (currently installed) has `LSMinimumSystemVersion: 12.0` and will not launch on Big Sur. The newest Electron major whose bundled Electron.app carries `LSMinimumSystemVersion: 11.0` is **Electron 37** (Chromium 138, Node 22). Electron 37's latest stable patch is **37.10.3** (EOL: January 13, 2026 — already past EOL). This is a known, accepted risk documented in the Big Sur / Electron Downgrade section below. No other compatibility fallout was found: all Electron APIs used by this app exist in Electron 37, no native modules need rebuilding, and electron-builder 26 and electron-vite 5 are both version-agnostic with respect to Electron major.

**Primary recommendation:** Downgrade `electron` devDependency from `^42.0.0` to `37.10.3` (exact pin — no caret, since `^38` would re-introduce Big Sur breakage), rebuild `node_modules` entry, then follow the env-var-driven electron-builder 26 notarize pattern. Three yml edits, one new plist file, extended .env, and a release shell script. No custom `afterSign` hook needed.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Code signing (macOS) | Build toolchain | — | electron-builder calls `codesign` with Developer ID cert; happens at package time, not runtime |
| Notarization (macOS) | Build toolchain | Apple servers | electron-builder calls xcrun notarytool; Apple asynchronously validates and returns ticket |
| Stapling notarization ticket | Build toolchain | — | electron-builder's @electron/notarize staples the ticket to the .app before DMG wrapping |
| Windows NSIS installer assembly | Build toolchain | Wine (cross-build) | electron-builder bundles NSIS logic; Wine executes the Windows uninstaller extraction on Mac |
| Gatekeeper assessment (verification) | Dev machine | — | `spctl --assess` and `xcrun stapler validate` run locally before distributing |
| Session encryption at rest | App (existing) | OS Keychain/DPAPI | No change needed — safeStorage already implemented in Phase 1 |
| Release artifact collection | Release script | — | Shell script gathers DMGs and Windows artifacts into a `release/dist/` staging folder |
| Electron version downgrade | Build toolchain | — | package.json devDependency change; no code changes required |

---

## Standard Stack

### Core (already installed — no new packages)

| Tool / Package | Version (installed) | Purpose | Source |
|----------------|---------------------|---------|--------|
| electron-builder | 26.15.2 | Builds, signs, and packages DMG / NSIS / portable.exe | [VERIFIED: npm registry] |
| @electron/notarize | 2.5.0 (bundled with electron-builder) | Calls xcrun notarytool, handles stapling | [VERIFIED: npm registry] |
| xcrun notarytool | 1.1.2 (system) | Apple's notarization CLI (Xcode 13+) | [VERIFIED: installed] |
| codesign | system | macOS code-signing tool | [VERIFIED: installed] |
| xcrun stapler | system | Attaches notarization ticket to .app / .dmg | [VERIFIED: installed] |
| Wine | 11.0 (Homebrew) | Lets electron-builder run NSIS on macOS for Windows cross-build | [VERIFIED: installed] |

**No new npm packages are required for this phase.** All changes are to configuration files, a new entitlements plist, and a release shell script. The Electron version downgrade is a `devDependency` version change only.

### Supporting (existing — one version change required)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| electron | ~~42.4.0~~ **→ 37.10.3** | Electron runtime | **MUST downgrade** — see Big Sur section. Pin exact: `"electron": "37.10.3"` |
| electron-vite | 5.0.0 | Build orchestration; `electron-vite build` must run before package | No Electron version constraint — peer dep is vite only |
| dotenv | 17.x | Loads `.env` at build time in electron.vite.config.ts | Unaffected |

## Package Legitimacy Audit

This phase installs **no new npm packages**. All tools used are already present in `node_modules/` or are macOS system tools. The Electron downgrade is a version change to an existing devDependency, not a new package introduction. No audit table is required.

---

## Architecture Patterns

### System Architecture Diagram

```
.env (gitignored)                       electron-builder.yml
  MRSPROPER_API_ID/HASH                   mac.identity: (cert name or removed)
  APPLE_API_KEY (path to .p8)             mac.notarize: (not set = auto)
  APPLE_API_KEY_ID                        mac.target: [dmg x64, dmg arm64]
  APPLE_API_ISSUER                        win.target: [nsis x64, portable x64]
  CSC_NAME (optional)
        |
        v
npm run build                           tsc --build --force
  electron-vite build                     type check gate
  → out/main, out/preload, out/renderer
        |
        v
npm run package:mac
  electron-builder --mac
  (downloads electron@37.10.3-darwin-{arch}.zip if not cached)
        |
        ├─ [arm64] codesign --deep --hardened-runtime \
        │          --entitlements build/entitlements.mac.plist \
        │          release/mac-arm64/MrsProper.app
        │          └─ xcrun notarytool submit ... --wait
        │             xcrun stapler staple MrsProper.app
        │          → release/MrsProper-0.9.0-arm64.dmg
        │
        └─ [x64]  codesign (same flow)
                  └─ notarize (same flow)
                  → release/MrsProper-0.9.0.dmg  (no arch suffix for x64)

npm run package:win
  electron-builder --win
        |
        └─ Wine executes NSIS uninstaller extraction
        → release/MrsProper-Setup-0.9.0.exe  (NSIS)
           release/MrsProper-0.9.0-portable.exe

release-script.sh  [D-09 local release script]
        |
        ├─ Pre-flight: verify .env vars set, cert in keychain
        ├─ typecheck gate: npx tsc --build --force
        ├─ npm run build
        ├─ npm run package:mac  (signs + notarizes)
        ├─ npm run package:win  (unsigned)
        ├─ spctl --assess (Gatekeeper pre-check)
        ├─ xcrun stapler validate
        └─ mkdir release/dist/ → copy artifacts
```

### Recommended Project Structure Changes

```
/                           (project root)
├── package.json            EDIT: "electron": "37.10.3" (exact pin, no caret)
├── electron-builder.yml    EDIT: remove identity:null, remove zip targets
├── build/
│   ├── entitlements.mac.plist   NEW: hardened runtime entitlements
│   ├── icon.png            (existing)
│   └── icon-win.png        (existing)
├── .env.example            EDIT: add 4 notarization env vars
├── scripts/
│   └── release.sh          NEW: local release script (D-09)
└── release/                (gitignored, output dir)
    ├── MrsProper-0.9.0-arm64.dmg
    ├── MrsProper-0.9.0.dmg
    ├── MrsProper-Setup-0.9.0.exe
    └── MrsProper-0.9.0-portable.exe
```

### Pattern 1: electron-builder 26 Signing via env vars (not yml config)

**What:** The macOS `identity` config and signing env vars (`CSC_NAME`) determine which cert signs the app. Notarization is driven entirely by env vars; no `notarize:` block needed in yml.

**When to use:** Always for this project (D-01, D-02).

**Verified from:** `node_modules/app-builder-lib/out/codeSign/macCodeSign.js` line 262, `MacTargetHelper.js` lines 236-254, `macPackager.js` line 296.

```yaml
# electron-builder.yml mac section — Phase 7 final form
mac:
  target:
    - target: dmg
      arch:
        - x64
        - arm64
  # identity: null  <-- REMOVE this line to let electron-builder auto-detect
  # OR set explicitly:
  # identity: "Developer ID Application: Matej Sychra (8VN6AYV2LV)"
  hardenedRuntime: true   # default is true; explicit for clarity
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  icon: build/icon.png
  extendInfo:
    CFBundleDisplayName: "Mrs. Proper"
```

```bash
# .env additions (gitignored) — D-02
APPLE_API_KEY=/path/to/AuthKey_XXXXXXXXXX.p8   # full absolute path to .p8 file
APPLE_API_KEY_ID=XXXXXXXXXX                    # 10-char key ID from App Store Connect
APPLE_API_ISSUER=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  # UUID issuer from App Store Connect
# Optional — electron-builder auto-finds Developer ID cert without this:
# CSC_NAME=Developer ID Application: Matej Sychra (8VN6AYV2LV)
```

**IMPORTANT:** `APPLE_API_KEY` is a **file system path** to the `.p8` file, not the file contents. This is confirmed by `xcrun notarytool submit --key <path>` (the `--key` argument description: "File system path to the private key").

### Pattern 2: Entitlements File for Hardened Runtime

**What:** Electron requires three entitlements to run under the hardened runtime that Apple mandates for notarization. electron-builder has a built-in template at `node_modules/app-builder-lib/templates/entitlements.mac.plist` with exactly these three. Placing `build/entitlements.mac.plist` causes electron-builder to use it automatically (default path lookup).

**Verified from:** `node_modules/app-builder-lib/templates/entitlements.mac.plist` (read directly).

```xml
<!-- build/entitlements.mac.plist — NEW FILE -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <!-- V8 JIT compilation -->
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <!-- Electron internals (unsigned executable memory) -->
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <!-- GramJS native dependencies and Electron helper processes -->
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
  </dict>
</plist>
```

### Pattern 3: Notarize Flow (how electron-builder 26 triggers it)

**What:** `notarizeIfProvided` in `MacTargetHelper` runs automatically after signing. It reads env vars via `getNotarizeOptions`. If `notarize: false` is set in yml, it is skipped. If the env vars are absent, it warns and skips. No custom `afterSign` hook is needed.

**Trigger logic** (verified from `MacTargetHelper.js` lines 256-270):
1. If `mac.notarize === false` → skip with log message
2. Call `getNotarizeOptions(appPath)` which reads `APPLE_API_KEY/APPLE_API_KEY_ID/APPLE_API_ISSUER`
3. If no env vars → warn and skip (graceful degradation for dev builds)
4. If env vars present → call `@electron/notarize` → `xcrun notarytool submit --wait` → staple

This means dev builds without env vars set will warn but not fail.

### Pattern 4: Local Release Shell Script

**What:** A single `scripts/release.sh` script orchestrates the full release flow. Shell script (not npm scripts) is recommended because it can exit early on errors, log clearly, and handle the multi-step flow without npm run chain limitations.

```bash
#!/usr/bin/env bash
set -euo pipefail

# scripts/release.sh — D-09 local release script
# Usage: ./scripts/release.sh [0.9.0]

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version>  e.g. $0 0.9.0"
  exit 1
fi

# Pre-flight checks
[ -f .env ] || { echo "ERROR: .env not found. Copy .env.example and fill values."; exit 1; }
source .env
[ -n "${APPLE_API_KEY:-}" ]    || { echo "ERROR: APPLE_API_KEY not set in .env"; exit 1; }
[ -n "${APPLE_API_KEY_ID:-}" ] || { echo "ERROR: APPLE_API_KEY_ID not set in .env"; exit 1; }
[ -n "${APPLE_API_ISSUER:-}" ] || { echo "ERROR: APPLE_API_ISSUER not set in .env"; exit 1; }
[ -f "$APPLE_API_KEY" ]        || { echo "ERROR: .p8 file not found at $APPLE_API_KEY"; exit 1; }

# Version bump
npm version "$VERSION" --no-git-tag-version

# Type check
npx tsc --build --force

# Build renderer + main
npm run build

# Package macOS (signs + notarizes)
npm run package:mac

# Package Windows (unsigned cross-build via Wine)
npm run package:win

# Gatekeeper pre-verification
echo "Verifying signatures..."
spctl --assess --type exec --verbose "release/mac-arm64/MrsProper.app"
spctl --assess --type exec --verbose "release/mac/MrsProper.app"
xcrun stapler validate "release/MrsProper-${VERSION}-arm64.dmg"
xcrun stapler validate "release/MrsProper-${VERSION}.dmg"

# Collect artifacts
mkdir -p "release/dist"
cp "release/MrsProper-${VERSION}-arm64.dmg"  "release/dist/"
cp "release/MrsProper-${VERSION}.dmg"         "release/dist/"
cp "release/MrsProper Setup ${VERSION}.exe"   "release/dist/" 2>/dev/null || \
cp release/MrsProper*Setup*.exe               "release/dist/" 2>/dev/null || true
cp "release/MrsProper-${VERSION}-portable.exe" "release/dist/" 2>/dev/null || true

echo ""
echo "Release artifacts in release/dist/:"
ls -lh "release/dist/"
```

### Pattern 5: Gatekeeper Pre-Verification (before handing off to users)

**What:** Verify the signed/notarized builds locally before distributing. These checks work on the dev machine and catch signing failures without needing a clean machine.

```bash
# Test 1: Gatekeeper assessment of .app (developer bypass not needed for signed)
spctl --assess --type exec --verbose "release/mac-arm64/MrsProper.app"
# Expected: "source=Notarized Developer ID" or "accepted"

# Test 2: Stapler ticket validation on DMG
xcrun stapler validate "release/MrsProper-0.9.0-arm64.dmg"
# Expected: "The validate action worked!"

# Test 3: Check quarantine simulation (add quarantine, then assess DMG)
# On the dev machine, Gatekeeper is typically disabled for development.
# The quarantine xattr is added automatically when files are downloaded.
# Manual quarantine simulation:
xattr -w com.apple.quarantine "0083;00000000;Safari;00000000-0000-0000-0000-000000000000" \
      "release/MrsProper-0.9.0-arm64.dmg"
spctl --assess --type open --verbose --context context:primary-signature \
      "release/MrsProper-0.9.0-arm64.dmg"
```

### Pattern 6: Electron Version Pin in package.json

**What:** Pin Electron to an exact version (no caret) to prevent automatic upgrades to Electron 38+ which would re-introduce Big Sur incompatibility.

**When to use:** Required for this project due to D-16 Big Sur constraint.

```json
// package.json devDependencies — BEFORE (incompatible with Big Sur)
"electron": "^42.0.0"

// package.json devDependencies — AFTER (Big Sur compatible, exact pin)
"electron": "37.10.3"
```

**Why exact pin, not `^37`:** `^37.x.x` resolves to the latest `37.x.x` within the major, which is fine now. But if the dev machine runs `npm install` after npm releases a new `37.x.x` patch, the version is stable within major. Using exact pin (`"37.10.3"`) eliminates ambiguity and makes the downgrade intent explicit. If you prefer semver range, `"~37.10.3"` (patch-range) is also acceptable — it allows `37.10.x` bugfixes but blocks `37.11.x` or any `38.x`. Do not use `^37.x.x` without confirming that future `37.x` patches don't reintroduce a macOS minimum bump.

### Anti-Patterns to Avoid

- **Never run `notarize: false`** in yml for release builds — it silently skips notarization and produces a Gatekeeper-blocked DMG. Only acceptable for dev/CI non-release builds.
- **Never set `identity: null`** for release builds — it skips signing, and notarize will also fail (unsigned apps are rejected by Apple).
- **Never commit `.env`** — it contains the path to the .p8 key. `.env` is already in `.gitignore`.
- **Never commit the .p8 key file** — add it to `.gitignore` if stored inside the project directory.
- **Never use `hardcodedRuntime: false`** for a notarized build — Apple requires hardened runtime for notarization to pass (introduced macOS 10.14 enforcement).
- **Do not set `CSC_LINK` for this project** — `CSC_LINK` expects a `.p12` certificate export. For macOS, the cert is already in Keychain; electron-builder auto-finds the Developer ID Application cert. `CSC_NAME` can optionally specify which cert, but is not required when only one matching cert is in the Keychain.
- **Do not call `npm version` without `--no-git-tag-version`** in the release script — the default creates a git tag before artifacts are verified.
- **Do not use `"electron": "^37.10.3"` with a caret if the intent is to stay on 37** — a caret allows upgrades within the major only (`37.x.x`), which is safe. But if you accidentally write `"^38"` or run an upgrade command, Big Sur compatibility will break. Exact pin or tilde-range is safer.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Notarization | Custom `afterSign` hook + manual notarytool calls | electron-builder 26 built-in `notarizeIfProvided` | electron-builder 26 auto-detects env vars, handles stapling, integrates with the sign step. afterSign is only needed for non-standard workflows. |
| Windows installer (NSIS) on Mac | Any manual Wine scripting | electron-builder `--win` with Wine installed | electron-builder's NsisTarget uses WineVmManager automatically when `wine` is on PATH |
| DMG creation | Any manual `hdiutil` scripting | electron-builder `dmg` target | Handles icon layout, Applications symlink, title, architecture-specific output |
| Code signing | Manual `codesign` invocations | electron-builder signing with cert in Keychain | electron-builder orchestrates signing of all helpers/frameworks in the correct order |

**Key insight:** electron-builder 26's built-in notarize integration means the entire sign → notarize → staple chain happens with zero custom code. The only required config is the env vars.

---

## Big Sur / Electron Downgrade

> **Scope change — D-16 (added post-initial-research):** The primary admin's Mac cannot upgrade beyond macOS 11.7.10. This section documents the downgrade research and all compatibility implications.

### Finding 1: Downgrade Target — Electron 37.10.3

**Electron ↔ macOS minimum version table (Chromium-driven):**

| Electron major | macOS minimum | Chromium | Status (as of 2026-06-12) |
|---------------|--------------|----------|--------------------------|
| 33–37 | 11.0 (Big Sur) | 130–138 | Past EOL |
| 38–42 | 12.0 (Monterey) | 140–148 | 40/41/42 active; 38/39 past EOL |

**Verification method:** Fresh `npm install electron@33.4.11` in a temp directory → read `Electron.app/Contents/Info.plist` → `LSMinimumSystemVersion: 11.0`. Same verified empirically for `electron@37.10.3` (both arm64 and x64 distributions). [VERIFIED: empirical plist check on two installed builds]

**Chromium's macOS 11 support drop:** Chromium dropped macOS 11 support beginning with Chrome 130 (shipped in Electron 38). Electron 37 bundles Chromium 138.0.7204.35, which is the **last Chromium major supporting Big Sur.** [CITED: electronjs.org/blog/electron-38-0]

**Downgrade target: `electron@37.10.3`** — the latest stable patch in the last Big Sur-capable major.

- Available arches on npm: `darwin-arm64` and `darwin-x64` both exist for 37.10.3 [VERIFIED: checksums.json from installed package]
- Both arches carry `LSMinimumSystemVersion: 11.0` [VERIFIED: empirical plist check]
- Bundled Node.js: **22.16.0** — same major as current project requirement [CITED: electronjs.org/blog/electron-37-0]
- Bundled V8: 13.8

### Finding 2: Security Support Status — EOL Risk

**Electron 37 reached EOL on January 13, 2026.** [VERIFIED: releases.electronjs.org/schedule]

As of today (2026-06-12), Electron 37 has been unsupported for **~5 months**. Electron supports only the latest three stable major versions; as of today those are Electron 40, 41, and 42.

**Implications of shipping an EOL Electron:**

| Risk | Severity | Mitigation |
|------|----------|------------|
| No further security patches for Electron 37 | MEDIUM-HIGH | App has no browser-side untrusted content; renderer CSP is strict (`connect-src 'none'`, no external JS loaded). Reduced attack surface vs. a general browser. |
| Chromium 138 CVEs go unpatched | MEDIUM | Chromium 138 is itself out of support; public CVEs for it accumulate over time. |
| GramJS and other deps receive no Electron-level fixes | LOW | GramJS is pure JS (not an Electron module); it remains independently updateable. |
| Discovery: future patch to 37.10.x will not arrive | CERTAIN | The 37.x.x series is frozen. `37.10.3` is the final release in that line. |

**Honest risk summary:** For a closed-distribution desktop admin tool whose renderer displays only local app UI (no external web content, no browser extensions, no arbitrary URLs), the Chromium CVE risk is substantially lower than for a general-purpose browser wrapper. The CSP (`connect-src 'none'`) and `sandbox: true` + `contextIsolation: true` configuration further limits the renderer blast radius. This is the accepted tradeoff to support the primary admin's machine. Document the Electron 37 EOL status in the app's release notes so future maintainers understand the constraint.

**No Electron version exists that is both Big Sur-capable AND currently within Electron's 3-major support window.** Electron 38 (the oldest currently-supported major that receives patches) requires macOS 12. This is a fundamental constraint from Chromium's platform support policy.

### Finding 3: Compatibility Fallout Audit

All findings are **no breaking change** except the version number itself.

#### electron-vite 5.0.0

- `electron-vite` 5.0.0 peer dependency: `vite: "^5.0.0 || ^6.0.0 || ^7.0.0"` — **no Electron version constraint** [VERIFIED: installed node_modules/electron-vite/package.json]
- electron-vite reads the Electron version from `node_modules/electron` at build time; it does not enforce a minimum. Electron 37 works unchanged.

#### electron-builder 26.15.2

- electron-builder has no `peerDependencies` on `electron` [VERIFIED: installed node_modules/electron-builder/package.json]
- electron-builder reads the Electron version from the project's installed `electron` package and downloads the matching Electron binaries for packaging. Switching the installed version from 42 to 37 is the only required change.
- The notarize flow (`notarizeIfProvided`, `MacTargetHelper.js`) is Electron-version-agnostic — it calls `xcrun notarytool`, not anything inside the Electron binary.

#### electron-store 11.0.2

- `electron-store` 11.0.2 has **no peerDependencies on Electron** [VERIFIED: installed node_modules/electron-store/package.json — `peerDependencies: {}`]
- The `electron@^38.1.2` reference found in the package.json is under `devDependencies` only — it is the version the author uses for development testing, not a runtime constraint.
- The project already uses electron-store's ESM-only API pattern correctly (`await import('electron-store')` in `severityChannels.ts`), which is independent of Electron version.

#### safeStorage API

- All three methods used by this app — `isEncryptionAvailable()`, `encryptString()`, `decryptString()` — are present in Electron 37.10.3 types [VERIFIED: grep of electron.d.ts from installed electron@37.10.3]
- `safeStorage` was introduced in Electron 15; it has not changed surface API through Electron 42.

#### Other Electron APIs used in this app

All APIs verified as present in Electron 37.10.3 types:

| API | Found in Electron 37 types | Notes |
|-----|---------------------------|-------|
| `app`, `BrowserWindow`, `nativeTheme` | Yes (3 occurrences each) | Core, unchanged |
| `ipcMain`, `ipcRenderer` | Yes (15, 23 occurrences) | Core, unchanged |
| `contextBridge` | Yes (3 occurrences) | Unchanged |
| `safeStorage` | Yes (4 occurrences) | Unchanged since Electron 15 |
| `webContents.session.webRequest.onHeadersReceived` | Yes (2 occurrences) | Unchanged |
| `webContents.executeJavaScript` | Yes (8 occurrences) | Unchanged |
| `app.isPackaged` | Yes (2 occurrences) | Unchanged |
| `loadFile`, `loadURL` | Yes | Unchanged |
| `sandbox`, `contextIsolation`, `nodeIntegration` (webPreferences) | Yes (12, 3, 8 occurrences) | Unchanged |

[VERIFIED: all grep counts from installed electron@37.10.3 electron.d.ts]

#### Breaking changes in Electron 33–37 affecting this app

Checked against official breaking-changes documentation [CITED: electronjs.org/docs/latest/breaking-changes]:

| Version | Breaking change | Affects this app? |
|---------|----------------|------------------|
| Electron 37 | Utility process unhandled rejection → warn instead of crash | No — app does not use utility processes |
| Electron 36 | `app.commandLine` normalizes uppercase switches to lowercase | No — app does not use `app.commandLine` |
| Electron 35 | `console-message` event signature changed to object parameter | No — app does not listen to `console-message` |
| Electron 35 | New `registerPreloadScript` API (deprecated `setPreloads`) | No — preload is specified in BrowserWindow constructor, not via setPreloads |
| Electron 33 | Frame properties may return detached `WebFrameMain` instances | No — app does not access frame references across navigations |

**Result: zero breaking changes affect this app's code.** No source code edits are needed — only `package.json` version change and `npm install`.

#### GramJS (telegram@2.26.22)

- GramJS is pure JavaScript — no native `.node` binaries [VERIFIED: `find node_modules/telegram -name "*.node"` returns no results]
- GramJS runs in Electron's main process Node runtime. Electron 37 bundles Node 22.16.0 — same major as Electron 42's Node 24.x. GramJS is compatible with Node 18/20/22 per CLAUDE.md. No concern.
- No `@electron/rebuild` step is needed (no native modules in any dependency).

#### TypeScript types

- `"electron": "37.10.3"` in devDependencies also updates the types. The type surface for all APIs used by this app is present and identical in Electron 37 types. TypeScript compilation will succeed after the version change.

### Finding 4: Signing and Notarization — No Change for Electron 37

Notarization is a **macOS Developer toolchain operation**, not an Electron-version-dependent operation:

- `xcrun notarytool` (v1.1.2) operates on the `.app` bundle regardless of which Electron version is inside it
- Hardened runtime entitlements are identical for Electron 37 and Electron 42
- `@electron/notarize` 2.5.0 calls `xcrun notarytool submit --wait` and then staples — version-agnostic
- The Developer ID Application certificate (`B4C1E53A...`, team `8VN6AYV2LV`) is not tied to an Electron version

**No changes to signing or notarization configuration are required due to the downgrade.**

### Finding 5: Architecture (Intel + Apple Silicon) on macOS 11

**Big Sur 11.7.10 runs on both Intel Macs (x86_64) and Apple Silicon Macs (arm64).** The primary admin's machine architecture is not confirmed in research — the verification plan should cover both or establish which one she has. Both Electron 37 DMG architectures exist on the npm registry and carry `LSMinimumSystemVersion: 11.0`:

- `electron-v37.10.3-darwin-arm64.zip` [VERIFIED: checksums.json]
- `electron-v37.10.3-darwin-x64.zip` [VERIFIED: checksums.json]

electron-builder 26 downloads the correct arch when building each DMG target — no special configuration is needed. Distributing both the x64 DMG and the arm64 DMG (per D-03) ensures the admin can install the correct one for her machine.

### Finding 6: Verification — Big Sur-Specific Considerations

**Notarization stapling and Gatekeeper on Big Sur 11.7.10 work identically to Monterey:**
- `spctl --assess` behavior is the same on 11.x
- Notarization tickets are Apple-server-side; Gatekeeper on Big Sur queries Apple's CDN for the ticket if it was not stapled, just as on 12.x
- Stapled tickets work on Big Sur — `xcrun stapler staple` embeds the ticket in the DMG; Gatekeeper on 11.x reads it offline

**Big Sur-specific verification step:** The D-13 matrix now explicitly includes the Big Sur machine (per D-13 update in CONTEXT.md). The smoke test (D-14: install from DMG, launch, reach Telegram code-entry) is the primary verification. There are no Big Sur-specific Gatekeeper flags or spctl options.

**One caution:** If the Big Sur machine has SIP disabled or is in a developer mode, Gatekeeper behavior may differ. The smoke test should be run on the machine as-configured (the admin's normal working state), not with SIP modified.

### Summary — Downgrade Action Items for the Plan

1. **Change** `package.json` `devDependencies`: `"electron": "^42.0.0"` → `"electron": "37.10.3"`
2. **Run** `npm install` to rebuild `node_modules/electron` with the 37.10.3 distribution
3. **Run** `npm test` and `npx tsc --build --force` to verify nothing broke
4. **Verify** `node_modules/electron/dist/Electron.app/Contents/Info.plist` shows `LSMinimumSystemVersion: 11.0`
5. **No code changes required** — all Electron APIs used by this app are present and unchanged in Electron 37
6. **Add Big Sur Mac** to the D-13 verification matrix explicitly (already in CONTEXT.md D-13)
7. **Update release notes** to state minimum macOS requirement is **11.0 (Big Sur)** — remove any "macOS 12+" language

---

## Common Pitfalls

### Pitfall 1: `identity: null` prevents signing AND notarization
**What goes wrong:** The existing `electron-builder.yml` has `mac.identity: null`, which tells electron-builder to **skip signing entirely** (verified from `macPackager.js` line 296: `if (qualifier === null) return this.helper.handleNullIdentity()`). If this line is not removed, signing is skipped regardless of what env vars are set.
**Why it happens:** `identity: null` was intentionally added in Phase 1 as a placeholder for Phase 7. In YAML, `null` (unquoted) maps to JavaScript `null`, not the string "null" — confirmed by testing the yml parser.
**How to avoid:** Remove the `identity: null` line entirely. electron-builder will then auto-detect the Developer ID Application certificate from the Keychain. Optionally add `identity: "Developer ID Application: Matej Sychra (8VN6AYV2LV)"` for explicitness.
**Warning signs:** Build log says "skipped macOS code signing — reason: identity explicitly is set to null"

### Pitfall 2: `APPLE_API_KEY` must be a file path, not file contents
**What goes wrong:** Setting `APPLE_API_KEY` to the .p8 file contents (the PEM text) causes xcrun notarytool to fail with a cryptic "invalid key" or "file not found" error.
**Why it happens:** `xcrun notarytool submit --key <value>` interprets the value as a file path (confirmed from notarytool help: "File system path to the private key"). The @electron/notarize library passes the env var value directly to `--key`.
**How to avoid:** Set `APPLE_API_KEY` to the absolute path: e.g., `APPLE_API_KEY=/Users/you/keys/AuthKey_XXXXXXXXXX.p8`
**Warning signs:** Notarytool error referencing key file not found, or "invalid credentials"

### Pitfall 3: Missing hardened runtime entitlements crash the signed app
**What goes wrong:** Signing with `hardenedRuntime: true` (the default) but without the three required entitlements causes the app to crash on launch. V8 JIT (`allow-jit`) and unsigned executable memory (`allow-unsigned-executable-memory`) are required for Electron/Chromium. Without `disable-library-validation`, GramJS's bundled native helpers may be blocked.
**Why it happens:** Hardened runtime enforces strict policies. Apple requires it for notarization, but it would kill Electron without these exceptions.
**How to avoid:** Create `build/entitlements.mac.plist` with all three entitlements (see Pattern 2). electron-builder checks `build/entitlements.mac.plist` as the default path — no yml config needed if the file is in `build/`.
**Warning signs:** App crashes immediately on launch; Console.app shows `SIGKILL` with "Library Validation" or "JIT" in the crash reason.

### Pitfall 4: Notarization takes minutes — the build looks hung
**What goes wrong:** `npm run package:mac` with notarization appears to hang for 2–10 minutes after signing. This is normal: `xcrun notarytool submit --wait` blocks while Apple's servers process the submission.
**Why it happens:** Apple's notarization service is asynchronous; `--wait` polls until done.
**How to avoid:** Don't interrupt the build. Add a comment to the release script warning about the wait time. First run may be slower; subsequent runs for the same binary hash are instant.
**Warning signs:** Build log shows "uploading" — this is normal, not a hang.

### Pitfall 5: Windows cross-build requires Wine AND pwsh is not needed
**What goes wrong:** electron-builder's error message "Cannot find suitable Parallels Desktop virtual machine and cannot access `pwsh` and `wine` locally" is misleading. It only needs ONE of: Parallels running a Windows VM, pwsh + wine, OR wine alone (for NSIS).
**Why it happens:** The NSIS target uses `WineVmManager` directly (not `getWindowsVm`), so the error in `vm.js` is for a different code path. For NSIS, Wine alone is sufficient.
**Verification:** `wine --version` returns `wine-11.0` — Wine is installed and working.
**How to avoid:** Ensure `wine` is on PATH (brew install wine-crossover or wine-stable). The `npm run package:win` script will work.

### Pitfall 6: x64 DMG has no arch suffix in filename
**What goes wrong:** A release checklist that looks for `MrsProper-0.9.0-x64.dmg` won't find the file. The x64 DMG artifact is named `MrsProper-0.9.0.dmg` (no arch suffix) because x64 is the `defaultArch` for macOS on electron-builder.
**Why it happens:** `expandArtifactNamePattern` with `skipDefaultArch=true` omits the arch suffix when the arch matches `defaultArch` (x64). arm64 gets the `-arm64` suffix.
**How to avoid:** Release script references `MrsProper-${VERSION}.dmg` (x64) and `MrsProper-${VERSION}-arm64.dmg` (arm64).

### Pitfall 7: `npm run build` must run before `package:mac` / `package:win`
**What goes wrong:** `electron-builder` packages the `out/` directory. If `npm run build` (electron-vite build) hasn't been run, `out/` is stale or missing, and the packaged app has no renderer assets.
**Why it happens:** electron-builder does not trigger electron-vite build automatically. The `package:mac` / `package:win` scripts call electron-builder directly.
**How to avoid:** Release script runs `npm run build` before both package steps.

### Pitfall 8: Notarization credits `.env` dotenv loading — but electron-builder doesn't call electron-vite
**What goes wrong:** The `.env` is loaded by `electron.vite.config.ts` via `dotenv.config()` — but only when `electron-vite build` runs. electron-builder reads notarization env vars from `process.env` directly, so they must be exported in the shell environment at the time `electron-builder` runs — not just in `.env`.
**Why it happens:** electron-builder runs as a separate Node process that doesn't execute the electron-vite config.
**How to avoid:** The release script must `source .env` (or `export $(grep -v '^#' .env | xargs)`) before calling `npm run package:mac`. Alternatively, use `dotenv-cli` or just ensure env vars are exported in the shell. The release script pattern in Pattern 4 uses `source .env` explicitly.

### Pitfall 9: Using `"electron": "^42.0.0"` (or any caret on 42+) after the downgrade
**What goes wrong:** If `npm install` is run with a caret range like `^37.10.3` after someone modifies the package.json, it remains safe (resolves within 37.x). But if the version is ever changed back to `^42` or `"latest"`, Big Sur compatibility breaks silently — the app builds fine but won't launch on macOS 11.7.10.
**Why it happens:** `npm install` respects the semver range in package.json. `^42` allows any `42.x.x` which all have `LSMinimumSystemVersion: 12.0`.
**How to avoid:** Use an exact pin `"electron": "37.10.3"` (no caret, no tilde). Add a comment in package.json above the line. Consider adding a pre-package script that asserts the correct Electron version.
**Warning signs:** `node_modules/electron/dist/Electron.app/Contents/Info.plist` shows `LSMinimumSystemVersion: 12.0` instead of `11.0`.

---

## Code Examples

### electron-builder.yml — Phase 7 Final Form

```yaml
# electron-builder.yml — Phase 7 (APP-03)
# Signed + notarized macOS DMGs, unsigned Windows NSIS + portable.
# Electron 37.10.3 — LSMinimumSystemVersion: 11.0 (Big Sur+) per D-16

appId: cz.corpus.mrsproper
productName: MrsProper
copyright: Copyright © 2026 Mrs. Proper

directories:
  buildResources: build
  output: release

files:
  - out/**/*
  - "!**/.DS_Store"

# macOS — APP-01, APP-03 (signed + notarized)
mac:
  target:
    - target: dmg
      arch:
        - x64
        - arm64
  # identity: null  <-- REMOVED; electron-builder auto-finds Developer ID Application cert
  hardenedRuntime: true
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  icon: build/icon.png
  extendInfo:
    CFBundleDisplayName: "Mrs. Proper"
  # notarize: not set = auto-detect from APPLE_API_KEY/APPLE_API_KEY_ID/APPLE_API_ISSUER env vars
  # To explicitly disable for dev builds: notarize: false

dmg:
  title: Mrs. Proper
  contents:
    - x: 130
      y: 220
    - x: 410
      y: 220
      type: link
      path: /Applications

# Windows — APP-02 (unsigned per D-05)
win:
  target:
    - target: nsis
      arch:
        - x64
    - target: portable
      arch:
        - x64
  icon: build/icon-win.png

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true

portable:
  artifactName: "${productName}-${version}-portable.exe"
```

### package.json devDependency — Downgrade

```json
// BEFORE (incompatible with Big Sur — LSMinimumSystemVersion: 12.0)
"electron": "^42.0.0"

// AFTER (Big Sur compatible — LSMinimumSystemVersion: 11.0)
// Exact pin: no caret, no tilde — prevents accidental upgrade to 38+
"electron": "37.10.3"
```

### .env.example Extensions

```bash
# MrsProper build-time credentials (D-04, AUTH-03)
MRSPROPER_API_ID=
MRSPROPER_API_HASH=

# macOS code signing + notarization (D-01, D-02, APP-03)
# Obtain from App Store Connect → Users and Access → Integrations → App Store Connect API
APPLE_API_KEY=/absolute/path/to/AuthKey_XXXXXXXXXX.p8
APPLE_API_KEY_ID=XXXXXXXXXX
APPLE_API_ISSUER=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
# Team ID (read-only reference — embedded in Developer ID Application cert):
# 8VN6AYV2LV  (Matej Sychra)
# CSC_NAME is optional when only one Developer ID Application cert is in Keychain
```

### Signing Identity Reference

```
Certificate:  Developer ID Application: Matej Sychra (8VN6AYV2LV)
SHA-1 hash:   B4C1E53A0B61810876FE2A6CDF96516EC2D45D81
Team ID:      8VN6AYV2LV
Source:       security find-identity -v -p codesigning (verified on dev machine)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `altool` for notarization | `notarytool` | Xcode 13 / 2021; `altool` removed in Xcode 15 | `APPLE_API_KEY` is passed as `--key <path>` to notarytool; `altool` env vars had different names |
| Custom `afterSign` hook | electron-builder 26 built-in `notarizeIfProvided` | electron-builder 25+ | No custom hook needed; env vars alone trigger notarization |
| `keytar` for session encryption | Electron `safeStorage` | Phase 1 of this project | Already implemented; no change in Phase 7 |
| Electron 42 (macOS 12+ minimum) | Electron 37 (macOS 11+ minimum) | D-16 scope change | Downgrade required for Big Sur support; security tradeoff documented |

**Deprecated/outdated:**
- `altool`: removed from Xcode 15+. Do not use `APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD` with altool. notarytool is the replacement and is what `@electron/notarize` 2.x uses.
- Custom `afterSign` hook with `@electron/notarize`: still works but not needed when electron-builder 26's built-in integration suffices.

---

## macOS Version Compatibility

~~**CRITICAL FINDING:** Electron 42 requires **macOS 12 Monterey** as the minimum supported version.~~ **SUPERSEDED BY D-16.** See Big Sur / Electron Downgrade section above.

**UPDATED FINDING:** This project MUST use **Electron 37.10.3**, which carries `LSMinimumSystemVersion: 11.0` (Big Sur). [VERIFIED: empirical plist check on installed electron@37.10.3]

**Electron version boundary:**
- Electron 33–37: `LSMinimumSystemVersion: 11.0` (Big Sur) — all past EOL as of 2026-06-12
- Electron 38+: `LSMinimumSystemVersion: 12.0` (Monterey) — 40/41/42 currently supported

**Distribution notes:** Release notes and README MUST state macOS 11.0 (Big Sur) or later as the system requirement. Do NOT state "macOS 12+" — that was the pre-downgrade state.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The App Store Connect API key (.p8) has not been created yet and needs to be generated at appstoreconnect.apple.com | Code Examples / .env.example | Low — if the key already exists, just use its values. No plan step changes. |
| A2 | The Windows VM available for D-13 verification can mount a DMG or access files via shared folder | Verification / D-13 | Low — standard Windows VM setups support shared folders |
| A3 | The primary admin's Big Sur machine is an Intel Mac (x64) | Big Sur / Architecture section | Low — both x64 and arm64 Electron 37 DMGs carry LSMinimumSystemVersion: 11.0. Either arch DMG will work. No plan change needed; distribute both per D-03. |
| A4 | Electron 37.10.3 is the final patch release in the 37.x series | Big Sur / Downgrade target | Low — if a 37.10.4+ patch is released post-research, it would also be Big Sur-capable and could be used instead. Pin to `37.10.3` until confirmed otherwise. |

**All other claims in this research were verified or cited from installed package source code, system tools, official documentation, or empirical tool output.**

---

## Open Questions

1. **Where will the .p8 key file be stored?**
   - What we know: `APPLE_API_KEY` must be an absolute path to the file. The file must NOT be committed.
   - What's unclear: Whether to store it inside the project repo (gitignored) or in a fixed location like `~/.apple-keys/`.
   - Recommendation: Store outside the repo at a fixed absolute path (e.g., `~/.credentials/mrsproper/AuthKey_XXXXXXXXXX.p8`). The .env file already uses absolute paths for API credentials. Avoids accidental git-add.

2. **Does the Intel Mac need to be a physical machine or is a VM sufficient?**
   - What we know: D-13 requires ARM Mac + Intel Mac + Big Sur Mac + Windows VM. The user confirmed "all three are available."
   - What's unclear: Whether the Intel Mac and the Big Sur Mac are the same machine, and whether it is physical or a VM.
   - Recommendation: Physical machine is preferred for notarization testing (Gatekeeper behavior can differ in VMs depending on SIP settings). However, a VM with SIP enabled will work for the D-14 smoke test.

3. **Is the Big Sur machine Intel or Apple Silicon?**
   - What we know: macOS 11.7.10 runs on both x64 and arm64 Macs; both Electron 37 DMG arches support Big Sur.
   - What's unclear: Which DMG to hand the admin — x64 or arm64.
   - Recommendation: Ask or check before distribution. If unknown, distribute both and let her try the arm64 one first (Apple Silicon Macs are more common at this point, and arm64 is needed by newer Apple Silicon even on Big Sur). Both will work on her machine as long as the arch matches.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Developer ID Application cert | macOS signing (D-01) | ✓ | SHA-1: B4C1E53... (Matej Sychra, team 8VN6AYV2LV) | — |
| xcrun notarytool | macOS notarization (D-02) | ✓ | 1.1.2 (41) | — |
| xcrun stapler | Staple ticket to DMG | ✓ | system (Xcode CLI) | — |
| codesign | Code signing | ✓ | system (Xcode CLI) | — |
| spctl | Gatekeeper verification | ✓ | system | — |
| Wine | Windows cross-build (D-07) | ✓ | wine-11.0 | — |
| electron-builder | Build + package | ✓ | 26.15.2 (node_modules) | — |
| @electron/notarize | Notarize integration | ✓ | 2.5.0 (bundled with electron-builder) | — |
| App Store Connect API key (.p8) | Notarization (D-02) | ? | (not verified — must be created/retrieved) | None — blocking |
| electron@37.10.3 | Big Sur compatibility (D-16) | Pending | Will be downloaded by npm install | — |

**Missing dependencies with no fallback:**
- App Store Connect API key (.p8): Must be created at appstoreconnect.apple.com → Users and Access → Integrations → App Store Connect API. Required before the release script can notarize. The plan should include a "create API key" task or a checkpoint verifying it exists.

**Missing dependencies with fallback:**
- None.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.x |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| APP-03 | macOS build signs without error, notarizes, passes spctl | manual (packaging + OS-level) | `spctl --assess --type exec --verbose release/mac-arm64/MrsProper.app` | N/A (shell command) |
| APP-03 | Stapler ticket attached to DMG | manual (post-build) | `xcrun stapler validate "release/MrsProper-0.9.0-arm64.dmg"` | N/A |
| APP-03 | App launches on ARM Mac (smoke test) | manual (D-14) | — | N/A |
| APP-03 | App launches on Intel Mac (smoke test) | manual (D-14) | — | N/A |
| APP-03 | App launches on **macOS 11.7.10 Big Sur Mac** (smoke test) | manual (D-13/D-16) | — | N/A |
| APP-03 | App launches on Windows VM (smoke test) | manual (D-14) | — | N/A |
| APP-03 | Telegram login reaches code-entry step | manual (D-14) | — | N/A |
| D-16 | Electron 37.10.3 installed, LSMinimumSystemVersion is 11.0 | automated pre-check | `grep "LSMinimumSystemVersion" node_modules/electron/dist/Electron.app/Contents/Info.plist` | N/A (shell command) |

**Note:** APP-03 is inherently a packaging/OS-level requirement. No unit or integration tests can verify code-signing or Gatekeeper behavior. Existing vitest suite (`npm test`) must remain green before packaging — it is the pre-flight code gate.

### Sampling Rate

- **Per task commit:** `npm test` (existing vitest suite — ensures no regressions in config changes)
- **Per wave merge:** `npm test` + `npx tsc --build --force`
- **Phase gate:** Full vitest green + spctl/stapler verification + D-14 smoke test on all four machines (ARM Mac, Intel Mac, Big Sur Mac, Windows VM) before `/gsd:verify-work`

### Wave 0 Gaps

None — existing test infrastructure covers all phase requirements. This phase adds no new TypeScript source files, so no new test files are needed. The verification is shell-level (spctl, stapler) and manual (D-14 smoke test).

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | no | — |
| V6 Cryptography | no — credentials are handled by OS tools | OS Keychain (existing safeStorage) + Apple notarytool |

**Threat patterns for this phase:**

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| .p8 key file committed to git | Disclosure | gitignore + external key storage path |
| .env with notarization credentials committed | Disclosure | .env already in .gitignore; release script validates .env is present and not committed |
| Signing with wrong certificate (Apple Development vs Developer ID) | Spoofing | electron-builder auto-selects "Developer ID Application" type; explicit `identity` string prevents wrong cert selection |
| api_id/api_hash in unsigned Windows build is extractable | Disclosure | Known accepted risk (documented in CLAUDE.md "Shipping a single app-wide api_id/api_hash"); no mitigation for Phase 7 |
| EOL Electron 37 Chromium CVEs unpatched | Elevation of privilege | Renderer CSP (`connect-src 'none'`), `sandbox: true`, `contextIsolation: true` limit blast radius. App displays only local UI, no external web content. Accepted tradeoff for Big Sur support. |

---

## Project Constraints (from CLAUDE.md)

| Directive | Applies to Phase 7 |
|-----------|--------------------|
| Must use Telegram MTProto User API (GramJS) | No change — existing implementation |
| Session credentials stored encrypted at rest (safeStorage) | No change — existing implementation; safeStorage API is identical in Electron 37 |
| Destructive actions require explicit final confirmation | No change — existing implementation |
| Electron + GramJS in-process | No change; GramJS runs identically in Electron 37's Node 22 runtime |
| electron-builder 25.x+ for packaging | Already at 26.15.2; no Electron version constraint |
| Electron `safeStorage` for session (NOT `electron-store` encryption) | No change — safeStorage exists in Electron 37 |
| Never reuse official Telegram client api_id/api_hash | No change |
| Sequential p-queue (concurrency 1) for removals | No change |
| `.env` gitignored, credentials never committed | Enforced — release script validates |
| `tsc --build` (not `tsc --noEmit`) for type checking | Enforced in release script |

---

## Sources

### Primary (HIGH confidence)
- `node_modules/app-builder-lib/out/mac/MacTargetHelper.js` — notarizeIfProvided, getNotarizeOptions, env var names (APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER), handleNullIdentity behavior — VERIFIED by reading source
- `node_modules/app-builder-lib/out/macPackager.js` — identity null → handleNullIdentity, sign() flow, notarize after sign — VERIFIED by reading source
- `node_modules/app-builder-lib/out/codeSign/macCodeSign.js` line 262 — CSC_NAME env var — VERIFIED by reading source
- `node_modules/app-builder-lib/templates/entitlements.mac.plist` — three required Electron entitlements — VERIFIED by reading source
- `node_modules/@electron/notarize/lib/notarytool.js` — --key is file path, not content — VERIFIED by reading source
- `node_modules/app-builder-lib/out/vm/WineVmManager.js` + `vm.js` — Wine for NSIS cross-build — VERIFIED by reading source
- `node_modules/dmg-builder/out/dmg.js` line 25 — x64 DMG has no arch suffix (defaultArch behavior) — VERIFIED by reading source
- `xcrun notarytool submit --help` — `--key <key>`: "File system path to the private key" — VERIFIED by running command
- `security find-identity -v -p codesigning` — Developer ID Application cert for Matej Sychra (8VN6AYV2LV) present — VERIFIED by running command
- **[Big Sur downgrade]** Empirical: `npm install electron@33.4.11` + `electron@37.10.3` (both arm64 and x64) in temp dirs → `Electron.app/Contents/Info.plist` → `LSMinimumSystemVersion: 11.0` — VERIFIED by running commands
- **[Big Sur downgrade]** `node_modules/electron-vite/package.json` — peer deps are `vite` only, no Electron version constraint — VERIFIED by reading file
- **[Big Sur downgrade]** `node_modules/electron-builder/package.json`, `node_modules/app-builder-lib/package.json` — no `peerDependencies` on Electron — VERIFIED by reading files
- **[Big Sur downgrade]** `node_modules/electron-store/package.json` — `peerDependencies: {}` (Electron reference is in devDependencies only) — VERIFIED by reading file
- **[Big Sur downgrade]** Electron 37 type definitions (`electron.d.ts` from `npm install electron@37.10.3`) — all APIs used by this app present — VERIFIED by grep counts on installed types
- **[Big Sur downgrade]** `checksums.json` from `npm install electron@37.10.3` — `darwin-arm64` and `darwin-x64` both exist — VERIFIED by reading file
- **[Big Sur downgrade]** `releases.electronjs.org/schedule` — Electron 37 EOL: January 13, 2026 — CITED
- https://www.electron.build/docs/api/app-builder-lib.Interface.MacConfiguration — notarize boolean, hardenedRuntime default true, entitlements path — CITED

### Secondary (MEDIUM confidence)
- https://www.electron.build/docs/mac/ — APPLE_API_KEY method confirmation, entitlements requirements — CITED
- **[Big Sur downgrade]** https://www.electronjs.org/blog/electron-33-0 — "macOS 11 (Big Sur) or later will be required to run Electron v33.0.0 and higher" — CITED
- **[Big Sur downgrade]** https://www.electronjs.org/blog/electron-38-0 — "macOS 11 (Big Sur) is no longer supported by Chromium; macOS 12 (Monterey) or later required for Electron v38.0.0 and higher" — CITED
- **[Big Sur downgrade]** https://www.electronjs.org/blog/electron-37-0 — Electron 37 includes Node.js 22.16.0, Chromium 138 — CITED
- **[Big Sur downgrade]** https://www.electronjs.org/docs/latest/breaking-changes — breaking changes for Electron 33–37 reviewed; none affect this app — CITED

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from installed node_modules source code and system tools
- Architecture: HIGH — signing/notarize flow traced through actual electron-builder 26 source
- Pitfalls: HIGH — pitfalls derived from reading the actual implementation code, not documentation alone
- Big Sur downgrade target (Electron 37.10.3): HIGH — verified empirically by installing and reading Info.plist for both arm64 and x64
- Electron 37 API compatibility: HIGH — verified by grep against installed electron@37.10.3 type definitions
- Electron 37 EOL status: HIGH — verified from official releases schedule
- electron-vite/electron-builder/electron-store downgrade compatibility: HIGH — verified from installed package.json peer deps

**Research date:** 2026-06-12
**Valid until:** 2026-09-12 (electron-builder 26.x is stable; Apple's notarize toolchain is stable; Electron 37 is frozen — no new patches expected)

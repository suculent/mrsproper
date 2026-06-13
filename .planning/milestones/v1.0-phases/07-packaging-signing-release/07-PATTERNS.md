# Phase 7: Packaging, Signing & Release - Pattern Map

**Mapped:** 2026-06-12
**Files analyzed:** 6 new/modified files
**Analogs found:** 5 / 6

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `electron-builder.yml` | config | request-response (build-time) | `electron-builder.yml` (existing, Phase 1) | exact — same file, in-place edit |
| `package.json` | config | build-time | `package.json` (existing) | exact — same file, version + scripts edit |
| `.env.example` | config | build-time | `.env.example` (existing) | exact — same file, extend pattern |
| `build/entitlements.mac.plist` | config | build-time | `node_modules/app-builder-lib/templates/entitlements.mac.plist` | exact — official template, copy verbatim |
| `scripts/release.sh` | utility | batch | `package.json` scripts block (npm script chain) | role-partial — no existing shell script; npm scripts are the closest analog |
| `README.md` | docs | — | none | no analog — first README in this project |

---

## Pattern Assignments

### `electron-builder.yml` (config, build-time edit)

**Analog:** `electron-builder.yml` lines 1–79 (current file — in-place edit)

**Existing file structure** (lines 1–79, full file):
```yaml
# electron-builder packaging configuration (APP-01, APP-02)
appId: cz.corpus.mrsproper
productName: MrsProper
copyright: Copyright © 2026 Mrs. Proper

directories:
  buildResources: build
  output: release

files:
  - out/**/*
  - "!**/.DS_Store"
  # Do NOT exclude node_modules — GramJS is externalized, electron-builder
  # must bundle prod dep tree. Excluding node_modules broke require('telegram').

mac:
  target:
    - target: dmg
      arch:
        - x64
        - arm64
    - target: zip       # <-- D-04: REMOVE this target block
      arch:
        - x64
        - arm64
  identity: null        # <-- REMOVE: prevents signing AND notarization
  icon: build/icon.png
  extendInfo:
    CFBundleDisplayName: "Mrs. Proper"

dmg:
  title: Mrs. Proper
  contents:
    - x: 130
      y: 220
    - x: 410
      y: 220
      type: link
      path: /Applications

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

**Phase 7 target form** (replace the mac section with):
```yaml
# macOS — APP-01, APP-03 (signed + notarized)
# Electron 37.10.3 — LSMinimumSystemVersion: 11.0 (Big Sur+) per D-16
mac:
  target:
    - target: dmg
      arch:
        - x64
        - arm64
  # identity: null REMOVED — auto-detect Developer ID Application cert from Keychain
  # To pin explicitly: identity: "Developer ID Application: Matej Sychra (8VN6AYV2LV)"
  hardenedRuntime: true
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  icon: build/icon.png
  extendInfo:
    CFBundleDisplayName: "Mrs. Proper"
  # notarize: not set = auto from APPLE_API_KEY/APPLE_API_KEY_ID/APPLE_API_ISSUER
  # Dev builds without env vars: notarizeIfProvided warns and skips gracefully
  # To explicitly disable: notarize: false
```

**Critical removals:**
- Remove the `- target: zip` block (lines 37–40) — D-04
- Remove `identity: null` line (line 41) — verified in `macPackager.js` line 296: `if (qualifier === null) return this.helper.handleNullIdentity()` — this skips signing entirely
- The `win:` section, `nsis:`, `portable:` sections are UNCHANGED

**Notarize trigger** (verified from `node_modules/app-builder-lib/out/mac/MacTargetHelper.js` lines 236–268):
```javascript
// MacTargetHelper.getNotarizeOptions — called by notarizeIfProvided
const appleApiKey = process.env.APPLE_API_KEY;       // file path to .p8
const appleApiKeyId = process.env.APPLE_API_KEY_ID;  // 10-char key ID
// APPLE_API_ISSUER = UUID issuer
// If notarize === false in yml: log "skipped" and return
// If env vars missing: warn "skipped" (graceful — dev builds pass)
// If env vars present: call @electron/notarize -> xcrun notarytool submit --wait -> staple
```

---

### `package.json` (config, version + scripts edit)

**Analog:** `package.json` lines 1–59 (current file — in-place edit)

**Existing scripts block** (lines 7–16):
```json
"scripts": {
  "dev": "electron-vite dev",
  "build": "electron-vite build",
  "start": "electron-vite preview",
  "package:mac": "electron-builder --mac",
  "package:win": "electron-builder --win",
  "test": "vitest run",
  "test:changed": "vitest run --changed",
  "typecheck": "tsc --noEmit -p tsconfig.node.json"
}
```

**Phase 7 changes:**

Version bump (line 3):
```json
// BEFORE
"version": "0.1.0"

// AFTER — D-11: bump to 0.9.0 RC
"version": "0.9.0"
```

Electron downgrade (devDependencies, line 51):
```json
// BEFORE — incompatible with Big Sur (LSMinimumSystemVersion: 12.0)
"electron": "^42.0.0"

// AFTER — Big Sur compatible (LSMinimumSystemVersion: 11.0), D-16
// Exact pin: no caret — prevents accidental upgrade to 38+ (macOS 12 minimum)
"electron": "37.10.3"
```

Optional: add a release script entry to the scripts block:
```json
"release": "bash scripts/release.sh"
```

**Typecheck command note:** The existing `typecheck` script uses `tsc --noEmit -p tsconfig.node.json` which is project-scoped. The release script MUST use `npx tsc --build --force` instead — the CLAUDE.md documents that root-level `tsc --noEmit` is a NO-OP pitfall. Both commands coexist; only the release script path matters for release gating.

---

### `.env.example` (config, extend pattern)

**Analog:** `.env.example` lines 1–7 (current file — extend in place)

**Existing pattern** (lines 1–7):
```bash
# MrsProper build-time credentials (D-04, AUTH-03)
# Copy this file to .env (gitignored) and fill in the actual values.
# Obtain from the project memory file:
#   ~/.claude/projects/-Users-igraczech-Repositories-MrsProper/memory/telegram-api-credentials.md
# NEVER commit .env — it is listed in .gitignore.
MRSPROPER_API_ID=
MRSPROPER_API_HASH=
```

**Phase 7 additions** (append to existing file, same comment style):
```bash
# macOS code signing + notarization (D-01, D-02, APP-03)
# Obtain from App Store Connect -> Users and Access -> Integrations -> App Store Connect API
# APPLE_API_KEY must be an absolute filesystem PATH to the .p8 file — NOT the file contents.
# Recommended storage location: ~/.credentials/mrsproper/AuthKey_XXXXXXXXXX.p8 (outside repo)
APPLE_API_KEY=/absolute/path/to/AuthKey_XXXXXXXXXX.p8
APPLE_API_KEY_ID=XXXXXXXXXX
APPLE_API_ISSUER=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
# Team ID (reference only — embedded in the Developer ID Application cert in Keychain):
# 8VN6AYV2LV  (Matej Sychra)
# CSC_NAME is optional when only one Developer ID Application cert is in Keychain.
# Uncomment to pin explicitly:
# CSC_NAME=Developer ID Application: Matej Sychra (8VN6AYV2LV)
```

**Pattern to preserve:**
- Comment block before each credential group (same style as existing MRSPROPER block)
- Empty `=` assignments for required vars (pattern established on lines 6–7)
- Commented-out optional vars with explanation (new addition for CSC_NAME)
- `# NEVER commit .env` warning stays at top of file

---

### `build/entitlements.mac.plist` (config, new file)

**Analog:** `node_modules/app-builder-lib/templates/entitlements.mac.plist` lines 1–14 (official electron-builder template — copy verbatim)

**Source template** (verified exact content from `node_modules/app-builder-lib/templates/entitlements.mac.plist`):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <!-- https://github.com/electron/electron-notarize#prerequisites -->
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <!-- https://github.com/electron-userland/electron-builder/issues/3940 -->
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
  </dict>
</plist>
```

**Why all three entitlements are required:**
- `allow-jit`: V8 JIT compilation — Electron/Chromium crashes without it under hardened runtime
- `allow-unsigned-executable-memory`: Required for Electron internals; without it, `SIGKILL` on launch with "Library Validation" in crash reason
- `disable-library-validation`: Required for GramJS bundled native helpers and Electron helper processes

**electron-builder auto-discovery:** electron-builder 26 checks `build/entitlements.mac.plist` as the default path. No yml configuration needed — placing the file in `build/` is sufficient. The yml `entitlements:` and `entitlementsInherit:` keys are added for explicitness (both pointing to `build/entitlements.mac.plist`).

---

### `scripts/release.sh` (utility, new file)

**Analog:** `package.json` scripts block (lines 7–16) — closest existing analog is the npm script chain. No shell scripts exist in this project; the pattern to follow is the sequential structure of npm scripts extended into a bash script with error handling.

**dotenv loading pattern** from `electron.vite.config.ts` lines 6–9:
```typescript
// electron.vite.config.ts loads .env for build-time define substitution:
import { config as loadDotenv } from 'dotenv'
loadDotenv()
```
The release script must replicate this at shell level with `source .env` — electron-builder does NOT execute the electron-vite config when called directly via `npm run package:mac`, so env vars must be exported into the shell process before calling electron-builder.

**Typecheck gate pattern** from CLAUDE.md (Conventions section):
```bash
# Correct — checks all composite projects
npx tsc --build --force

# WRONG — this is a NO-OP at project root (documented pitfall)
npx tsc --noEmit
```

**Version bump pattern** (npm built-in, `--no-git-tag-version` is critical):
```bash
# Anti-pattern: npm version without --no-git-tag-version creates a git tag
# before artifacts exist — reverting is painful
npm version "$VERSION" --no-git-tag-version
```

**Script target form** (from RESEARCH.md Pattern 4, verified against all project conventions):
```bash
#!/usr/bin/env bash
set -euo pipefail

# scripts/release.sh — D-09 local release script
# Usage: ./scripts/release.sh [0.9.0]
# Prerequisites: .env populated, .p8 key at APPLE_API_KEY path, Developer ID cert in Keychain

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version>  e.g. $0 0.9.0"
  exit 1
fi

# Pre-flight: validate .env and required vars
[ -f .env ] || { echo "ERROR: .env not found. Copy .env.example and fill values."; exit 1; }
source .env
[ -n "${MRSPROPER_API_ID:-}" ]  || { echo "ERROR: MRSPROPER_API_ID not set"; exit 1; }
[ -n "${MRSPROPER_API_HASH:-}" ] || { echo "ERROR: MRSPROPER_API_HASH not set"; exit 1; }
[ -n "${APPLE_API_KEY:-}" ]     || { echo "ERROR: APPLE_API_KEY not set"; exit 1; }
[ -n "${APPLE_API_KEY_ID:-}" ]  || { echo "ERROR: APPLE_API_KEY_ID not set"; exit 1; }
[ -n "${APPLE_API_ISSUER:-}" ]  || { echo "ERROR: APPLE_API_ISSUER not set"; exit 1; }
[ -f "$APPLE_API_KEY" ]         || { echo "ERROR: .p8 file not found at $APPLE_API_KEY"; exit 1; }

# Version bump (no git tag — tag after UAT confirms clean-machine pass)
npm version "$VERSION" --no-git-tag-version

# Type check gate (must use --build, NOT --noEmit — see CLAUDE.md pitfall)
npx tsc --build --force

# Build renderer + main (must run before package:mac/win — out/ is the input to electron-builder)
npm run build

# Package macOS (signs + notarizes — notarization takes 2-10 min, do not interrupt)
echo "Packaging macOS (signing + notarization — may take several minutes)..."
npm run package:mac

# Package Windows (unsigned cross-build via Wine — Wine 11.0 on PATH)
echo "Packaging Windows..."
npm run package:win

# Gatekeeper pre-verification (run on dev machine before distributing)
echo "Verifying signatures..."
spctl --assess --type exec --verbose "release/mac-arm64/MrsProper.app"
spctl --assess --type exec --verbose "release/mac/MrsProper.app"
xcrun stapler validate "release/MrsProper-${VERSION}-arm64.dmg"
xcrun stapler validate "release/MrsProper-${VERSION}.dmg"

# Collect artifacts into release/dist/
mkdir -p "release/dist"
cp "release/MrsProper-${VERSION}-arm64.dmg"  "release/dist/"
cp "release/MrsProper-${VERSION}.dmg"         "release/dist/"
# NSIS artifact name includes a space: "MrsProper Setup 0.9.0.exe"
cp release/MrsProper*Setup*.exe               "release/dist/" 2>/dev/null || true
cp release/MrsProper*portable*.exe            "release/dist/" 2>/dev/null || true

echo ""
echo "Release artifacts in release/dist/:"
ls -lh "release/dist/"
echo ""
echo "Next: distribute via Drive/Telegram/USB, then run smoke tests on:"
echo "  - ARM Mac (Apple Silicon)"
echo "  - Intel Mac"
echo "  - macOS 11.7.10 Big Sur Mac (primary admin)"
echo "  - Windows VM"
echo "Smoke test: install from DMG/exe, app launches, Telegram login reaches code-entry step."
echo "After UAT passes: bump to 1.0.0 and tag."
```

---

### `README.md` (docs, new file)

**Analog:** None — this is the first README in the project.

**Content scope** (from D-08): Windows SmartScreen "More info -> Run anyway" instructions + macOS minimum version note (macOS 11 Big Sur or later). No dedicated install guide — short step-by-step inline in README.

**Pattern source:** The `electron-builder.yml` comment block style (lines 1–9 of existing yml) establishes the project's documentation voice — plain, direct, numbered steps for procedures.

---

## Shared Patterns

### Environment Variable Loading for Build Tools

**Source:** `electron.vite.config.ts` lines 6–9 + RESEARCH.md Pitfall 8
**Apply to:** `scripts/release.sh`

electron-builder reads notarization env vars from `process.env` directly — it does NOT execute `electron.vite.config.ts`. The release script must `source .env` before calling `npm run package:mac`:

```bash
# In scripts/release.sh — must precede npm run package:mac
source .env
# This exports APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER into the shell
# so electron-builder's child Node process inherits them via process.env
```

### Type Check Gate

**Source:** CLAUDE.md Conventions + RESEARCH.md Pitfall patterns
**Apply to:** `scripts/release.sh`

```bash
# Correct — composite project check
npx tsc --build --force

# Wrong (NO-OP at root) — do not use in release script
# npx tsc --noEmit
```

### Gitignore Coverage

**Source:** `.gitignore` lines 30–31
**Apply to:** `build/entitlements.mac.plist`, `.env.example`

Verified: `release/` is already in `.gitignore` (line 30) — build artifacts are not committed. `.env` is already gitignored (line 9). The `.p8 key file` should be stored outside the repo (e.g., `~/.credentials/mrsproper/`) to avoid accidental `git add`.

### Comment Style for Configuration Files

**Source:** `electron-builder.yml` lines 1–10, `.env.example` lines 1–5
**Apply to:** All new/modified config files

```yaml
# Purpose comment on line 1 (brief, references requirement IDs)
# Inline explanations for non-obvious choices
# Cross-references to CLAUDE.md pitfalls where applicable
```

```bash
# Section header comment
# Obtain/usage note
# NEVER/WARNING note for security-sensitive vars
VAR_NAME=
```

### artifact Filename Naming Conventions

**Source:** `electron-builder.yml` + RESEARCH.md Pitfall 6 + `node_modules/dmg-builder/out/dmg.js` line 25
**Apply to:** `scripts/release.sh` artifact copy commands

```bash
# x64 DMG — NO arch suffix (electron-builder defaultArch behavior)
MrsProper-${VERSION}.dmg

# arm64 DMG — has -arm64 suffix
MrsProper-${VERSION}-arm64.dmg

# NSIS installer — productName + space + "Setup" + space + version
"MrsProper Setup ${VERSION}.exe"

# Portable — explicit artifactName template from yml:
# "${productName}-${version}-portable.exe" -> MrsProper-0.9.0-portable.exe
MrsProper-${VERSION}-portable.exe
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `README.md` | docs | — | No README exists in this project; no analog to copy from |

---

## Metadata

**Analog search scope:** project root, `build/`, `node_modules/app-builder-lib/` (selected files)
**Files scanned:** 7 source files read + 2 node_modules files for pattern verification
**Pattern extraction date:** 2026-06-12

**Key constraints captured:**
- `identity: null` in yml is not a placeholder string — it is YAML null, which triggers `handleNullIdentity()` in macPackager.js and skips signing entirely. Must be removed, not commented.
- `APPLE_API_KEY` is a filesystem path, not file contents — verified from `@electron/notarize` source and `xcrun notarytool --help`.
- `release/` is already gitignored (`.gitignore` line 30) — no gitignore change needed.
- `scripts/` directory does not exist yet — must be created with `mkdir scripts/` before writing `release.sh`.
- No new npm packages are required for this phase — all tooling is already installed.

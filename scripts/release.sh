#!/usr/bin/env bash
set -euo pipefail

# scripts/release.sh — D-09 local release script
# Usage: ./scripts/release.sh <version>  e.g. ./scripts/release.sh 0.9.0
# Prerequisites: .env populated, .p8 key at APPLE_API_KEY path, Developer ID cert in Keychain

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version>  e.g. $0 0.9.0"
  exit 1
fi

# ──────────────────────────────────────────────
# Pre-flight: validate .env and required vars
# ──────────────────────────────────────────────
[ -f .env ] || { echo "ERROR: .env not found. Copy .env.example and fill values."; exit 1; }
# set -a / set +a: export every variable sourced from .env so that electron-builder
# (a child process of npm) inherits APPLE_API_KEY / APPLE_API_KEY_ID / APPLE_API_ISSUER.
# Without -a, `source .env` populates the current shell only; the notarizer never sees
# the vars and silently skips notarization ("notarize options were unable to be generated").
set -a
source .env
set +a
[ -n "${MRSPROPER_API_ID:-}" ]  || { echo "ERROR: MRSPROPER_API_ID not set in .env"; exit 1; }
[ -n "${MRSPROPER_API_HASH:-}" ] || { echo "ERROR: MRSPROPER_API_HASH not set in .env"; exit 1; }
[ -n "${APPLE_API_KEY:-}" ]     || { echo "ERROR: APPLE_API_KEY not set in .env"; exit 1; }
[ -n "${APPLE_API_KEY_ID:-}" ]  || { echo "ERROR: APPLE_API_KEY_ID not set in .env"; exit 1; }
[ -n "${APPLE_API_ISSUER:-}" ]  || { echo "ERROR: APPLE_API_ISSUER not set in .env"; exit 1; }
[ -f "$APPLE_API_KEY" ]         || { echo "ERROR: .p8 file not found at $APPLE_API_KEY"; exit 1; }

echo "Pre-flight checks passed."

# ──────────────────────────────────────────────
# Version bump (no git tag — tag after UAT confirms clean-machine pass)
# ──────────────────────────────────────────────
# --allow-same-version: no-ops gracefully when package.json already has this version
# (prevents "Version not changed" error when re-running the script at the same version).
npm version "$VERSION" --no-git-tag-version --allow-same-version

# ──────────────────────────────────────────────
# Type check gate
# Must use --build --force, NOT --noEmit — the root tsc --noEmit is a NO-OP
# for this project (composite project references; tsconfig files:[] at root).
# See CLAUDE.md documented pitfall.
# ──────────────────────────────────────────────
echo "Running type check..."
npx tsc --build --force

# ──────────────────────────────────────────────
# Build renderer + main
# Must run before package:mac/win — electron-builder packages out/ directory.
# Without this step the renderer is stale or missing.
# ──────────────────────────────────────────────
echo "Building..."
npm run build

# ──────────────────────────────────────────────
# Package macOS (signs + notarizes)
# APPLE_API_KEY/APPLE_API_KEY_ID/APPLE_API_ISSUER are now in the shell env
# (sourced from .env above) and inherited by electron-builder's child process.
# Notarization typically takes 2–10 minutes — do not interrupt.
# ──────────────────────────────────────────────
echo "Packaging macOS (signing + notarization — may take 2–10 minutes, do not interrupt)..."
npm run package:mac

# ──────────────────────────────────────────────
# Package Windows (unsigned cross-build from dev Mac via Wine)
# D-07: no Windows build environment required.
# ──────────────────────────────────────────────
echo "Packaging Windows..."
npm run package:win

# ──────────────────────────────────────────────
# Notarize + staple DMGs
# electron-builder notarizes and staples the .app bundle, but does NOT submit the
# DMG files to Apple notarization. A DMG can only be stapled if the DMG itself was
# submitted to notarytool. Do that here for both arch DMGs before distributing.
# Typical processing time: 1–3 minutes per DMG (contents are already notarized).
# ──────────────────────────────────────────────
notarize_dmg() {
  local dmg="$1"
  echo "Notarizing ${dmg}..."
  local output
  output=$(xcrun notarytool submit "${dmg}" \
    --key "$APPLE_API_KEY" \
    --key-id "$APPLE_API_KEY_ID" \
    --issuer "$APPLE_API_ISSUER" \
    --wait 2>&1)
  echo "${output}"
  if ! echo "${output}" | grep -q "status: Accepted"; then
    echo "ERROR: notarytool did not return 'status: Accepted' for ${dmg}"
    echo "Full notarytool output above. Check submission log with: xcrun notarytool log <submission-id>"
    exit 1
  fi
  echo "Stapling ${dmg}..."
  xcrun stapler staple "${dmg}"
}

notarize_dmg "release/MrsProper-${VERSION}-arm64.dmg"
notarize_dmg "release/MrsProper-${VERSION}.dmg"

# ──────────────────────────────────────────────
# Gatekeeper pre-verification
# Run on dev machine before distributing to confirm signing + stapling are intact.
# ──────────────────────────────────────────────
echo "Verifying Gatekeeper signatures..."
spctl --assess --type exec --verbose "release/mac-arm64/MrsProper.app"
spctl --assess --type exec --verbose "release/mac/MrsProper.app"
xcrun stapler validate "release/MrsProper-${VERSION}-arm64.dmg"
xcrun stapler validate "release/MrsProper-${VERSION}.dmg"

# ──────────────────────────────────────────────
# Artifact collection
# ──────────────────────────────────────────────
mkdir -p "release/dist"

cp "release/MrsProper-${VERSION}-arm64.dmg"  "release/dist/"
# x64 DMG has no arch suffix (electron-builder defaultArch behavior — Pitfall 6)
cp "release/MrsProper-${VERSION}.dmg"         "release/dist/"
# NSIS artifact name includes a space: "MrsProper Setup 0.9.0.exe" — use glob
cp release/MrsProper*Setup*.exe               "release/dist/" 2>/dev/null || true
cp release/MrsProper*portable*.exe            "release/dist/" 2>/dev/null || true

echo ""
echo "Release artifacts in release/dist/:"
ls -lh "release/dist/"
echo ""
echo "Next steps — distribute artifacts, then run smoke tests on:"
echo "  - ARM Mac (Apple Silicon)"
echo "  - Intel Mac"
echo "  - macOS 11.7.10 Big Sur Mac (primary admin)"
echo "  - Windows VM"
echo ""
echo "Smoke test: install from DMG/exe, app launches, Telegram login reaches code-entry step."
echo "After UAT passes: bump to 1.0.0 and git tag."

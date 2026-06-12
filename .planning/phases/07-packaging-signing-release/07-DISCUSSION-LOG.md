# Phase 7: Packaging, Signing & Release - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-12
**Phase:** 07-packaging-signing-release
**Areas discussed:** macOS signing & notarization, Windows signing strategy, Build & release pipeline, Clean-machine verification

---

## Pre-discussion: Todo Cross-Reference

| Option | Description | Selected |
|--------|-------------|----------|
| None — keep in backlog | Phase 7 stays pure packaging/signing | ✓ |
| Country rows clickable | Login-form CountryPicker fix | |
| Default country Czechia | +420 default in CountryPicker | |
| Day/Night theme toggle | New Day theme | |

**User's choice:** None — all three matched UI todos stay in the backlog.

---

## macOS Signing & Notarization

### Apple Developer membership

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, have an account | Sign + notarize with existing Developer ID | ✓ |
| Will enroll for this | Enroll ($99/yr) during this phase | |
| No — defer signing | Ship unsigned with right-click→Open instructions | |

### Notarization credentials

| Option | Description | Selected |
|--------|-------------|----------|
| App Store Connect API key | .p8 key file — no password expiry, CI-friendly (Recommended) | ✓ |
| Apple ID + app-specific password | Quicker setup, more fragile | |
| You decide | Claude picks during planning | |

### Mac architecture shape

| Option | Description | Selected |
|--------|-------------|----------|
| Universal DMG | One download, ~double app size (Recommended) | |
| Separate x64 + arm64 DMGs | Smaller downloads, admin must know their Mac type | ✓ |
| All three | Universal headline + per-arch | |

**Notes:** User chose separate per-arch DMGs against the recommendation — smaller downloads preferred.

### Mac target types

| Option | Description | Selected |
|--------|-------------|----------|
| DMG only | Simpler release page, faster builds (Recommended) | ✓ |
| Keep DMG + zip | Zip handy for unzip-and-run testing | |
| You decide | | |

---

## Windows Signing Strategy

### Signing approach

| Option | Description | Selected |
|--------|-------------|----------|
| Defer — ship unsigned | ROADMAP escape hatch; "More info → Run anyway" instructions | ✓ |
| Azure Trusted Signing | ~$10/mo, needs Azure account + identity validation | |
| Buy OV/EV certificate | $200–500/yr traditional cert | |

### Windows artifacts

| Option | Description | Selected |
|--------|-------------|----------|
| Both | NSIS installer + portable .exe (Recommended) | ✓ |
| NSIS installer only | Single canonical download | |
| Portable .exe only | Truest to "portable" concept | |

### Build location

| Option | Description | Selected |
|--------|-------------|----------|
| Cross-build from the Mac | One build machine; VM only verifies (Recommended) | ✓ |
| Build on Windows | Native build in the VM | |
| You decide | | |

### SmartScreen instructions placement

| Option | Description | Selected |
|--------|-------------|----------|
| Release notes + README | Short step-by-step where people download (Recommended) | ✓ |
| Dedicated install guide | Standalone doc with screenshots | |
| You decide | | |

---

## Build & Release Pipeline

### Build production

| Option | Description | Selected |
|--------|-------------|----------|
| Local scripted release | One script on the Mac: build → sign → notarize → collect (Recommended) | ✓ |
| GitHub Actions release | Tag-triggered CI builds | |
| Both | Local now + CI this phase | |

### Distribution

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub Releases | Stable links, free hosting | |
| Direct share | Drive/Telegram/USB to known admins | ✓ |
| Own website/server | corpus.cz download page | |

### Version

| Option | Description | Selected |
|--------|-------------|----------|
| 1.0.0 | Ship as the v1.0 milestone (Recommended) | |
| 0.9.x release candidate | RC until clean-machine UAT passes, then 1.0.0 | ✓ |
| You decide | | |

**Notes:** User chose RC versioning against the recommendation — 1.0.0 is earned by passing UAT.

### Auto-update

| Option | Description | Selected |
|--------|-------------|----------|
| Out — defer | No update feed under direct share (Recommended) | ✓ |
| In scope | Wire electron-updater now | |

---

## Clean-Machine Verification

### Available machines (multi-select)

| Option | Description | Selected |
|--------|-------------|----------|
| ARM Mac (Apple Silicon) | M-series Mac | ✓ |
| Intel Mac | Physical Intel Mac for the x64 DMG | ✓ |
| Windows VM | Windows 10/11 VM | ✓ |
| Physical Windows PC | Real Windows machine | |

### Verification depth

| Option | Description | Selected |
|--------|-------------|----------|
| Launch + login smoke | Install, open without block, login reaches code-entry (Recommended) | ✓ |
| Launch only | Strictly the roadmap criterion | |
| Full E2E on one machine | Plus full dry-run→removal flow from packaged build | |

### Recording

| Option | Description | Selected |
|--------|-------------|----------|
| UAT checklist doc | Per-machine checklist in the phase dir (Recommended) | |
| Informal — just confirm | User reports back verbally; no persisted artifact | ✓ |
| You decide | | |

**Notes:** User chose informal recording against the recommendation.

---

## Claude's Discretion

- Hardened-runtime entitlements and electron-builder notarize config shape
- Signing env-var names (extending the .env pattern)
- Release script form and artifact collection layout
- Clean-Gatekeeper verification mechanics (quarantine attr, spctl/stapler checks)
- Exact RC version number

## Deferred Ideas

- Windows code signing (Azure Trusted Signing preferred future option)
- GitHub Actions release pipeline
- Auto-update via electron-updater
- Hosted download page
- Backlog UI todos (country rows clickable, default Czechia, Day/Night theme) — reviewed, not folded

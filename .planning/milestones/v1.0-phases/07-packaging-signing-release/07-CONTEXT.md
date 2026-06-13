# Phase 7: Packaging, Signing & Release - Context

**Gathered:** 2026-06-12
**Status:** Ready for planning

<domain>
## Phase Boundary

MrProper ships as distributable installers verified launching on clean machines: a code-signed and notarized macOS build (separate x64 and arm64 DMGs) that opens without a Gatekeeper block, and an unsigned-by-decision Windows build (NSIS installer + portable .exe) with documented "More info → Run anyway" instructions. The macOS build MUST run on macOS 11.7.10 Big Sur (the primary admin's machine — she cannot upgrade), which requires downgrading Electron from 42 to the newest version supporting macOS 11. Release is a local scripted process on the dev Mac; distribution is direct share to known admins. Verification is a launch + Telegram-login smoke test on an ARM Mac, an Intel Mac, a macOS 11.7.10 Big Sur Mac, and a Windows VM, confirmed informally.

Requirements: APP-03.

</domain>

<decisions>
## Implementation Decisions

### macOS Signing & Notarization
- **D-01:** Sign with the user's existing Apple Developer Program membership (Developer ID Application certificate). Signing is IN scope, not deferred.
- **D-02:** Notarize via an **App Store Connect API key (.p8)** — not Apple ID + app-specific password. Credentials follow the existing gitignored `.env` pattern (D-04 precedent from Phase 1).
- **D-03:** Mac artifacts: **separate x64 and arm64 DMGs** — NOT a universal binary. User accepted the "which Mac do I have?" tradeoff for smaller downloads.
- **D-04:** **DMG only** — remove the zip targets from electron-builder.yml. Zip can return if auto-update ever ships.

### Windows Signing
- **D-05:** Windows code signing is **DEFERRED** (ROADMAP escape hatch explicitly allows this). Ship unsigned; SmartScreen "More info → Run anyway" is the accepted v1 experience.
- **D-06:** Ship **both** the NSIS installer and the portable .exe (both already configured in electron-builder.yml).
- **D-07:** Windows artifacts are **cross-built from the dev Mac** (`npm run package:win`) — no Windows build environment. The Windows VM is for verification only.
- **D-08:** SmartScreen run-anyway instructions live in **release notes + README** (short step-by-step). No dedicated install guide. Include the macOS note only if any Gatekeeper friction remains post-notarization.

### Build & Release Pipeline
- **D-09:** **Local scripted release** on the dev Mac: one script/checklist covering build → sign → notarize → collect artifacts. No CI/GitHub Actions in this phase.
- **D-10:** Distribution is **direct share** (Drive/Telegram/USB) to known admins. No GitHub Releases, no hosted download page.
- **D-11:** Version: bump package.json to a **0.9.x release candidate** for the Phase 7 builds. The bump to **1.0.0 happens only after clean-machine UAT passes**.
- **D-12:** **Auto-update is OUT** — deferred. Direct-share distribution has no update feed; new versions are shared the same way.

### Clean-Machine Verification
- **D-13:** Verification matrix: **ARM Mac (Apple Silicon) + Intel Mac + macOS 11.7.10 (Big Sur) Mac + Windows VM**. The Big Sur machine is an explicit, REQUIRED matrix entry — it belongs to the primary admin the app is being built for, and she cannot upgrade beyond 11.7.10.
- **D-16:** The app MUST run on macOS 11.7.10 Big Sur. Electron 42 requires macOS 12 (`LSMinimumSystemVersion: 12.0`), so this phase MUST downgrade Electron to the newest major version whose macOS minimum is ≤ 11 (research to confirm the exact version) and re-verify the app works on it before packaging. Big Sur support takes priority over staying on the latest Electron.
- **D-14:** Verification depth: **launch + login smoke** — install from the distributed artifact, app opens with no Gatekeeper/SmartScreen hard block, Telegram login reaches the code-entry step (proves embedded api_id/api_hash work in the packaged build). No destructive actions.
- **D-15:** Recording is **informal** — the user runs the checks and confirms back; no persisted UAT checklist document required for this phase.

### Claude's Discretion
- Hardened-runtime entitlements for Electron notarization (allow-jit etc.), electron-builder notarize config shape, and signing env-var names.
- Release script form (shell script vs npm script chain) and artifact collection layout.
- How "clean" Gatekeeper verification is performed (quarantine attribute handling, `spctl`/`stapler` checks before manual testing).
- Exact RC version number (0.9.0 vs continuing a 0.9.x line).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Packaging configuration
- `electron-builder.yml` — current unsigned packaging config (targets, icons, asar/node_modules note, identity: null placeholder that this phase replaces)
- `electron.vite.config.ts` — build-time credential injection via dotenv + define (MRSPROPER_API_ID/HASH); release builds MUST run with a populated `.env`
- `.env.example` — credential env-var contract (D-04, AUTH-03); notarization credentials should extend this same pattern
- `package.json` — `package:mac` / `package:win` scripts, version field (0.1.0 → 0.9.x RC)

### Requirements & roadmap
- `.planning/ROADMAP.md` — Phase 7 goal + success criteria (incl. explicit deferral allowances for notarization and Windows cert)
- `.planning/REQUIREMENTS.md` — APP-03

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `electron-builder.yml`: working unsigned config from Phase 1 — dmg+zip mac (x64/arm64), nsis+portable win (x64), icons (`build/icon.png` mac, `build/icon-win.png` win), appId `cz.corpus.mrsproper`, display name "Mrs. Proper". Phase 7 edits this in place (add signing/notarize, drop zip targets).
- `build/` dir: icon sources already converted to PNG (icon.png 1024² round for mac, icon-win.png square for win).
- `npm run package:mac` / `package:win`: existing electron-builder entry points to wrap in the release script.

### Established Patterns
- Build-time secrets via gitignored `.env` + electron-vite `define` substitution — notarization/signing credentials (.p8 path, key ID, issuer ID) follow the same pattern as env vars consumed by electron-builder, never committed.
- Type-check gate: `npx tsc --build --force` (root `npx tsc --noEmit` is a NO-OP).
- The files allowlist in electron-builder.yml must NOT exclude node_modules (GramJS is externalized from the main bundle; prior breakage documented in the yml comments).

### Integration Points
- `mac.identity: null` and the missing `notarize` block in electron-builder.yml are the exact seams where signing config lands.
- `afterSign`/`notarize` hooks: electron-builder 26 has built-in notarize support (`mac.notarize` + APPLE_API_KEY/APPLE_API_KEY_ID/APPLE_API_ISSUER env vars) — no @electron/notarize custom script needed unless research finds otherwise.
- Output dir `release/` (gitignored via dist/out patterns — verify `release/` is actually gitignored before first packaged build commit).

</code_context>

<specifics>
## Specific Ideas

- The login smoke test on each machine must reach the SMS/code-entry step — this is the user's bar for "the packaged build really works" (embedded credentials + network path proven).
- Unsigned Windows is a conscious cost decision, not a TODO: revisit signing (Azure Trusted Signing was the runner-up) only if distribution widens beyond known admins.

</specifics>

<deferred>
## Deferred Ideas

- Windows code signing (Azure Trusted Signing ~$10/mo was the preferred future option) — revisit if distribution widens.
- GitHub Actions release pipeline — CI builds once the local scripted release is proven.
- Auto-update via electron-updater — requires a hosted feed; conflicts with direct-share distribution for now.
- Hosted download page (GitHub Releases or corpus.cz) — not needed for direct share.

### Reviewed Todos (not folded)
- "Make country rows clickable in login-form CountryPicker" — UI polish, out of packaging scope; stays in backlog.
- "Default country Czechia (+420) in CountryPicker" — UI polish, out of packaging scope; stays in backlog.
- "Add Day/Night theme toggle with new Day theme" — new UI capability, out of packaging scope; stays in backlog.

</deferred>

---

*Phase: 07-packaging-signing-release*
*Context gathered: 2026-06-12*

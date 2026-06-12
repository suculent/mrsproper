---
phase: 7
slug: packaging-signing-release
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-12
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing) + shell-level build verification (`spctl`, `stapler`, `codesign`, plist greps) |
| **Config file** | existing vitest config; build checks are script-level |
| **Quick run command** | `npx tsc --build --force` |
| **Full suite command** | `npx tsc --build --force && npx vitest run` |
| **Estimated runtime** | ~60 seconds |
| **Packaging verification** | `codesign --verify --deep --strict`, `xcrun stapler validate`, `spctl -a -t open --context context:primary-signature` on built DMG/app; `grep LSMinimumSystemVersion` on bundled Electron.app |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --build --force`
- **After every plan wave:** Run `npx tsc --build --force && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite green + packaged-artifact checks pass (codesign/stapler/spctl for mac, both win artifacts present)
- **Max feedback latency:** 120 seconds (packaging builds excepted — they run per-plan, not per-task)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (filled by planner) | | | APP-03 | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Key automated checks the planner must map to tasks:
- Electron downgrade (D-16): `grep LSMinimumSystemVersion node_modules/electron/dist/Electron.app/Contents/Info.plist` outputs `11.0`; `npx tsc --build --force` exits 0; `npx vitest run` exits 0; app launches in dev (`npm run dev` smoke).
- Signing config: built `.app` passes `codesign --verify --deep --strict`; `codesign -d --entitlements -` shows allow-jit / allow-unsigned-executable-memory / disable-library-validation.
- Notarization: `xcrun stapler validate <app>` exits 0; `spctl -a -t open --context context:primary-signature -v <dmg>` says accepted.
- Artifacts: `release/` contains exactly 2 DMGs (x64 + arm64), NSIS .exe, portable .exe; no .zip mac artifacts (D-04).
- Version: `node -p "require('./package.json').version"` outputs a 0.9.x value (D-11).

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — vitest + tsc are installed and green from Phases 1–6. No new test framework needed; packaging checks are CLI assertions inside release tasks.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Launch + Telegram-login smoke on ARM Mac | APP-03 / D-13, D-14 | Requires physical machine + Telegram code entry | Install from arm64 DMG, open app, start login, reach code-entry step |
| Launch + Telegram-login smoke on Intel Mac | APP-03 / D-13, D-14 | Requires physical machine | Install from x64 DMG, open app, start login, reach code-entry step |
| Launch + Telegram-login smoke on macOS 11.7.10 Big Sur (primary admin's machine class) | APP-03 / D-13, D-16 | Requires a Big Sur machine; the entire Electron-37 downgrade exists for this | Install from matching-arch DMG on 11.7.10, app must launch (no "requires macOS 12" error), reach login code-entry step |
| Launch smoke on Windows VM (unsigned) | APP-03 / D-13, D-05 | Requires Windows VM; SmartScreen interaction is interactive | Run NSIS installer + portable .exe, click "More info → Run anyway", app launches, login reaches code-entry step |
| Gatekeeper acceptance on clean Mac | APP-03 / D-14 | Quarantine-attribute behavior needs a download-path simulation | `xattr -w com.apple.quarantine` on DMG (or real download), open — no Gatekeeper hard block |

*Per D-15, results are confirmed informally by the user — no persisted UAT checklist document.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

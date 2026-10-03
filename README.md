# Mrs. Proper

Bulk-remove a Telegram bad actor from all your groups at once.

## System Requirements

- **macOS:** macOS 11 Big Sur or later (Apple Silicon and Intel)
- **Windows:** Windows 10 or 11 (64-bit)

## Install — macOS

1. Download the correct DMG:
   - Apple Silicon Mac: `MrsProper-x.x.x-arm64.dmg`
   - Intel Mac: `MrsProper-x.x.x.dmg`
2. Double-click the DMG and drag **Mrs. Proper** to your Applications folder.
3. Open Mrs. Proper from Applications.

The app is notarized — macOS will open it without a Gatekeeper warning.

## Install — Windows

1. Download the NSIS installer (`MrsProper Setup x.x.x.exe`) or the portable
   executable (`MrsProper-x.x.x-portable.exe`).
2. Double-click the installer or portable file.
3. If Windows SmartScreen shows **"Windows protected your PC"**:
   1. Click **More info**.
   2. Click **Run anyway**.
4. The installer or app opens normally.

The app is not yet code-signed for Windows. SmartScreen flags unsigned apps from
new publishers; this is expected behaviour for v1. The "More info → Run anyway"
path is the Microsoft-documented way to proceed with an unsigned app from a known
source.

## First Use

Log in with your Telegram account (phone number + login code from the Telegram
app). Mrs. Proper uses its own Telegram API access — no separate Telegram
registration is required.

## Technical Note

Built with Electron 37.10.3 (Chromium 138, Node 22) — minimum macOS 11.0 (Big Sur).
Electron 37 is past its EOL (January 2026). This version was chosen to support
macOS 11.7.10 (Big Sur) — upgrading to Electron 38+ requires macOS 12 (Monterey).
See D-16 in `.planning/phases/07-packaging-signing-release/07-CONTEXT.md`.

## Developer: Updating the Telegram TL schema

`npm run tl:update` re-fetches TDLib's current `telegram_api.tl` schema, strips
the fixed MTProto-core preamble lines (the handful of lines that just alias
core scalar types like `int`/`long`/`string`, plus a few proxy-only
constructors GramJS doesn't need), and overwrites `vendor/telegram-api.tl`.

This is a **release-time step**: run it, review the resulting git diff for
anything unexpected, and commit `vendor/telegram-api.tl` deliberately when you
want to pick up a new Telegram TL layer. It does **not** touch
`node_modules/telegram` by itself — that happens via `npm run tl:apply`
(wired as the `postinstall` hook on every `npm install`), which regenerates
the installed `telegram` package's TL object model from whatever is
currently committed in `vendor/telegram-api.tl`.

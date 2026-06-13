---
phase: 01-foundation-auth-session-portable-shell
plan: 01
subsystem: infra
tags: [electron, vite, react, typescript, tailwind, shadcn, gramjs, electron-builder, electron-vite]

requires: []

provides:
  - electron-vite three-bundle project (main/preload/renderer) at pinned versions
  - Hardened BrowserWindow with contextIsolation, nodeIntegration:false, sandbox:true
  - Build-time api_id/api_hash injection into MAIN bundle only via define + dotenv
  - shadcn/ui initialized (new-york/slate/CSS-variables) with Phase 1 design tokens
  - Offline Inter font via @fontsource/inter (no CDN)
  - electron-builder portable packaging config (macOS dmg/zip + Windows nsis/portable)
  - Full project structure skeleton (src/main/, src/preload/, src/renderer/, src/shared/)

affects:
  - 01-02 (auth flow — imports config.ts, uses SessionManager pattern on top of this scaffold)
  - 01-03 (session storage — uses safeStorage, userData path set up here)
  - 01-04 (IPC channels — preload whitelist established here)
  - 01-05 (shell UI — renderer App.tsx/shadcn components built here)
  - All subsequent phases (use this project-wide structure, tokens, and conventions)

tech-stack:
  added:
    - electron@42.4.0 (desktop shell)
    - electron-vite@5.0.0 (three-bundle build + HMR)
    - vite@^7 (pinned, NOT 8 — electron-vite peer constraint)
    - react@^19 + react-dom@^19 (renderer UI)
    - typescript@^5 (strict mode)
    - electron-builder@^26 (portable packaging)
    - "@vitejs/plugin-react-swc" (SWC-based React transform)
    - "@electron-toolkit/tsconfig" (main/renderer tsconfig split)
    - tailwindcss@^4 (styling tokens)
    - "@fontsource/inter" (offline Inter font)
    - "@radix-ui/react-dialog, @radix-ui/react-label, @radix-ui/react-select, @radix-ui/react-avatar, @radix-ui/react-alert-dialog, @radix-ui/react-slot" (Radix primitives)
    - cmdk (command palette)
    - clsx + tailwind-merge (shadcn utils)
    - class-variance-authority (shadcn variant system)
    - lucide-react (icon library)
    - dotenv (build-time .env loading)
    - telegram@2.26.22 (GramJS — installed, not yet called)
  patterns:
    - main/preload/renderer three-bundle split (electron-vite)
    - D-02 contextBridge trust boundary (contextIsolation + no nodeIntegration + sandbox)
    - Build-time credential injection via define (D-04, AUTH-03)
    - CSS-variable design token system (light + dark)
    - shadcn/ui component pattern (Radix primitives + Tailwind)

key-files:
  created:
    - package.json (pinned dependency manifest)
    - electron.vite.config.ts (three-bundle config + MAIN-only credential define)
    - tsconfig.json / tsconfig.node.json / tsconfig.web.json (strict TypeScript split)
    - .gitignore (.env, node_modules/, dist/, out/ coverage)
    - .env.example (var names only, no values)
    - src/main/index.ts (app lifecycle + hardened BrowserWindow)
    - src/main/telegram/config.ts (credential read point via import.meta.env)
    - src/preload/index.ts (contextBridge whitelist IPC bridge)
    - src/shared/authTypes.ts (AuthState union + DTOs + channel names)
    - src/shared/channels.ts (IPC channel name constants)
    - src/renderer/index.html (renderer entry point)
    - src/renderer/main.tsx (React root + font import)
    - src/renderer/App.tsx (placeholder, real UI in plan 05)
    - src/renderer/lib/utils.ts (cn() helper)
    - src/renderer/styles/globals.css (Phase 1 light + dark CSS-variable tokens)
    - components.json (shadcn config: new-york, slate, CSS vars)
    - tailwind.config.ts (Tailwind 4 config with Phase 1 token mapping)
    - electron-builder.yml (macOS dmg/zip + Windows nsis/portable, unsigned)
    - src/renderer/components/ui/{button,input,label,select,dialog,alert,avatar,command}.tsx
  modified:
    - .planning/phases/01-foundation-auth-session-portable-shell/01-UI-SPEC.md (shadcn_initialized: true)

key-decisions:
  - "Vite pinned to ^7 (NOT 8): electron-vite@5 peer range is ^5||^6||^7; Vite 8 Rolldown changes break peer resolution"
  - "telegram@2.26.22 pinned exactly (re-verified 2026-06-10 via npm view; no version drift)"
  - "electron@42.4.0 re-verified at build time (matches plan pin)"
  - "shadcn init run manually (components.json + components copied) because electron-vite is not detected by npx shadcn as a supported framework"
  - "Credentials load via dotenv in electron.vite.config.ts so .env is auto-read at build time without exporting env vars manually"
  - "Inter font bundled offline via @fontsource/inter (no Google Fonts CDN — SSRF/offline constraint)"
  - "CSP set to local-bundle-only in onHeadersReceived (no remote URLs — SSRF mitigation)"

patterns-established:
  - "Pattern: main/preload/renderer three-bundle split via electron-vite (all subsequent plans follow this)"
  - "Pattern: contextBridge whitelist in preload/index.ts (D-02 trust boundary — never expose GramJS or session)"
  - "Pattern: define in main vite section only for secrets (D-04 — creds compile into main binary, never renderer)"
  - "Pattern: CSS-variable design tokens in globals.css with :root (light) and .dark (dark) blocks"
  - "Pattern: shadcn components in src/renderer/components/ui/ with @renderer alias"

requirements-completed: [AUTH-03, APP-01, APP-02]

duration: 45min
completed: 2026-06-10
---

# Phase 01 Plan 01: Scaffold Electron-Vite Shell + shadcn Genesis Summary

**electron-vite three-bundle Electron shell with hardened BrowserWindow, build-time api_id/api_hash injection (main bundle only), shadcn/ui initialized with Phase 1 design tokens, offline Inter font, and unsigned-runnable electron-builder config for macOS + Windows**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-06-10T20:34:09Z
- **Completed:** 2026-06-10
- **Tasks:** 2 (+ 1 auto-approved checkpoint)
- **Files modified:** 35+

## Accomplishments

- Greenfield Electron project scaffolded from zero (no package.json existed) to a building, structured three-bundle project
- Hardened BrowserWindow (contextIsolation:true, nodeIntegration:false, sandbox:true, CSP local-only) establishes the D-02 trust boundary all phases inherit
- Build-time credential injection wired: `define` in MAIN vite section reads from untracked .env via dotenv; renderer section clean; automated grep guard confirms no api_hash in tracked files
- shadcn/ui initialized with full Phase 1 design tokens (light + dark CSS-variable token sets, 4-size/2-weight typography, 8-pt spacing) and 8 component files (button, input, label, select, dialog, alert, avatar, command)
- electron-builder.yml produces unsigned-runnable macOS (dmg + zip, x64 + arm64) and Windows (nsis + portable) artifacts

## Version Re-Verification (STATE.md blocker resolved)

- `electron`: 42.4.0 — confirmed (no version drift from plan pin)
- `telegram` (GramJS): 2.26.22 — confirmed (no version drift)
- `vite`: pinned ^7 (npm shows 8.0.x as latest; we correctly pin 7.x per electron-vite peer range `^5||^6||^7`)

## Dev Launch Path (Pitfall 6 — unsigned macOS builds)

For dev/testing on macOS, unsigned builds may trigger Gatekeeper on non-dev machines:
- **Dev machine:** `npm run dev` launches directly
- **Other macOS machine:** right-click the .app → Open, or run:
  ```
  xattr -dr com.apple.quarantine /path/to/MrProper.app
  ```
- **Windows:** SmartScreen prompt expected on first launch of unsigned .exe; click "More info" → "Run anyway"
- Full code signing (Apple Developer ID + Windows EV cert + notarization) is Phase 7 (APP-03)

## Task Commits

1. **Task 1: Scaffold electron-vite three-bundle project + hardened window** - `c17dac2` (feat)
2. **Task 2: Build-time credential injection + shadcn genesis + portable packaging** - `52d0b55` (feat)
3. **Task 3: Checkpoint** - Auto-approved (automated checks passed; interactive launch for human)

## Files Created/Modified

- `package.json` — pinned deps (vite@^7, electron@^42, telegram@2.26.22, react@^19)
- `electron.vite.config.ts` — three-bundle + MAIN-only define + dotenv loader
- `src/main/index.ts` — app lifecycle + hardened BrowserWindow + CSP
- `src/main/telegram/config.ts` — credential read point (import.meta.env, no literals)
- `src/preload/index.ts` — contextBridge whitelist (D-02 IPC trust boundary)
- `src/shared/authTypes.ts` — AuthState union type + FloodTick + channel names
- `src/shared/channels.ts` — IPC channel name constants
- `src/renderer/index.html` + `main.tsx` + `App.tsx` — renderer scaffold
- `src/renderer/lib/utils.ts` — cn() utility
- `src/renderer/styles/globals.css` — Phase 1 CSS-variable tokens (light + dark)
- `src/renderer/components/ui/` — button, input, label, select, dialog, alert, avatar, command
- `components.json` — shadcn config (new-york, slate, CSS vars)
- `tailwind.config.ts` — Tailwind 4 config with Phase 1 token mapping
- `electron-builder.yml` — macOS + Windows unsigned-runnable packaging
- `.env.example` — var names only (committed); `.env` gitignored
- `.gitignore` — node_modules/, dist/, out/, .env
- `tsconfig.json / tsconfig.node.json / tsconfig.web.json` — strict TypeScript split
- `.planning/phases/01-foundation-auth-session-portable-shell/01-UI-SPEC.md` — shadcn_initialized: true

## Decisions Made

- Vite pinned to ^7 per electron-vite@5 peer constraint (Vite 8 excluded from peer range)
- shadcn components manually scaffolded because `npx shadcn init` cannot detect electron-vite as a framework (outputs "could not detect a supported framework")
- dotenv used in electron.vite.config.ts for automatic .env loading at build time
- Inter font loaded offline via @fontsource/inter (400 + 600 weights) — no CDN dependency

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added globals.css stub before full token set**
- **Found during:** Task 1 (build test)
- **Issue:** Build failed because `src/renderer/styles/globals.css` was referenced in main.tsx but not yet created
- **Fix:** Created placeholder globals.css first, then replaced with full Phase 1 tokens in Task 2
- **Files modified:** src/renderer/styles/globals.css
- **Committed in:** c17dac2 (Task 1 commit, then overwritten in 52d0b55)

**2. [Rule 3 - Blocking] shadcn manual scaffolding (non-interactive CLI)**
- **Found during:** Task 2 (shadcn init)
- **Issue:** `npx shadcn init` exited with "could not detect a supported framework" for electron-vite
- **Fix:** Manually created components.json, tailwind.config.ts, globals.css tokens, and all 8 UI component files following shadcn/ui patterns (new-york style, slate base, CSS variables)
- **Files modified:** components.json, tailwind.config.ts, globals.css, src/renderer/components/ui/*
- **Committed in:** 52d0b55 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 blocking issues)
**Impact on plan:** No scope change. Both fixes were necessary to unblock the build and satisfy the plan's shadcn init requirement.

## Security Verification

| Check | Result |
|-------|--------|
| api_hash in tracked files (git grep) | PASS — not found |
| MRPROPER_API_HASH in renderer section of vite config | PASS — absent |
| contextIsolation: true in BrowserWindow | PASS — line 18 |
| nodeIntegration: false in BrowserWindow | PASS — line 19 |
| sandbox: true in BrowserWindow | PASS — line 20 |
| .env gitignored | PASS — git check-ignore confirms |
| .env.example has var names only (no values) | PASS |
| Inter font loaded offline | PASS — @fontsource/inter, no CDN |
| CSP allows local bundle only | PASS — onHeadersReceived handler |

## Known Stubs

- `src/renderer/App.tsx` — Renders a "MrProper / Loading..." placeholder; real auth UI and app shell arrive in plans 03–05
- `src/main/telegram/config.ts` — Exports API_ID/API_HASH via import.meta.env; not yet imported (SessionManager in plan 02 will import it)

These stubs are intentional scaffold placeholders, not data or functional gaps.

## Next Phase Readiness

- Project structure, build system, and design tokens are established — all subsequent plans build on these
- Plan 02 (auth flow) can import `src/main/telegram/config.ts` directly; credentials will inject from .env
- Plan 03 (session storage) can use `app.getPath('userData')` from the app lifecycle set up in src/main/index.ts
- Plan 05 (shell UI) inherits the full shadcn + design token system from this plan
- Windows portable build artifact not verified on a Windows machine (no Windows host available); this is expected for Phase 1 — manual verification at the phase gate

---
*Phase: 01-foundation-auth-session-portable-shell*
*Completed: 2026-06-10*

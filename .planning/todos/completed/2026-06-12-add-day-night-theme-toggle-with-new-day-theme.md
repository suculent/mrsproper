---
created: 2026-06-12T17:59:50.531Z
title: Add Day/Night theme toggle with new Day theme
area: ui
resolves_phase: 8
files:
  - src/renderer/shell/AppShell.tsx
  - tailwind.config.ts
---

## Problem

The app currently ships a single dark design. The user wants a Day/Night theme
toggle available from the app Menu, scheduled for the localization stage
(Phase 8: Localization — i18n & Czech Translation, v1.5), since both touch the
same settings/menu surface.

## Solution

- Add a `Theme` entry to the Menu with two rows: `Day` and `Night`
  (same row pattern as the planned `Language` switcher in Phase 8).
- Keep the current design exactly as-is and name it the **Night** theme.
- Create a new **Day** (light) theme — light palette over the existing
  Tailwind token system.
- Persist the choice (electron-store, like the severity preference) and apply
  it main-driven on startup (see electron-gotchas memory: theme is main-driven).

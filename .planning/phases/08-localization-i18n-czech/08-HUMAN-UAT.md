---
status: partial
phase: 08-localization-i18n-czech
source: [08-VERIFICATION.md]
started: 2026-06-13T03:05:00Z
updated: 2026-06-13T03:05:00Z
---

## Current Test

[awaiting human re-confirmation after post-UAT fix cycle]

## Tests

### 1. Language switch takes effect without restart — click Česky in Settings, walk all screens
expected: Every screen shows Czech immediately, no English strings visible, no page reload
result: [pending] — approved in 08-09 UAT, but 21 additional strings were externalized afterwards (fix commits 069b682..0401d2e); re-confirm TargetInput heading/placeholder, GroupsPane counters, GroupRow retry link

### 2. Czech plural forms visually correct in running app with real group counts
expected: 1 group → "1 skupina", 2–4 groups → "2 skupiny", 5+ groups → "5 skupin"
result: [pending] — approved in 08-09 UAT; exact strings also covered by automated tests

### 3. No flash of wrong language or theme on relaunch — set Czech + Day, quit, relaunch
expected: First paint shows Czech AND Day theme with zero flash of wrong state
result: [pending] — approved in 08-09 UAT; CR-02 fix now also seeds nativeTheme in main before window creation

### 4. OS theme change does not override stored Day/Night user preference
expected: Toggling macOS System Preferences Appearance while app shows Day keeps app in Day
result: [pending] — behavior changed by CR-02 fix AFTER the original UAT; this is the one item genuinely worth re-testing

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps

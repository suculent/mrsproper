---
created: 2026-06-11T18:20:00.000Z
title: Default country Czechia (+420) in CountryPicker
area: ui
files:
  - src/renderer/auth/CountryPicker.tsx:59-60
---

## Problem

User request: when the user starts typing a numerical (phone-mode) search input, Czechia should be the default country with `+420` preselected. Today `DEFAULT_COUNTRY` in CountryPicker.tsx is hardcoded to `US`, and the constant is shared by both the login phone step (PhoneStep.tsx) and the target input (TargetInput.tsx phone mode), so both currently preselect +1.

## Solution

Change `DEFAULT_COUNTRY` lookup from `c.code === 'US'` to `c.code === 'CZ'` in src/renderer/auth/CountryPicker.tsx:60. One-line change; both consumers pick it up automatically. Verify the +420 chip appears in TargetInput when typing bare digits and in the login phone step.

---
created: 2026-06-11T17:40:37.977Z
title: Make country rows clickable in login-form CountryPicker
area: ui
files:
  - src/renderer/auth/CountryPicker.tsx:113-131
---

## Problem

User report: rows in the country table/list on the login form are not clickable — clicking a row should select that country, but nothing happens. The picker is the `CountryPicker` popover used in phone entry (login form), also rendered by `TargetInput.tsx` for phone-mode target entry, so the fix benefits both.

The component already wires `onSelect` on each cmdk `CommandItem`, so the bug is likely cmdk filtering interference rather than a missing handler: the component pre-filters the country list with its own `search` state (via `CommandInput onValueChange`) while ALSO passing `value={country.code}` (2-letter code) to each item — cmdk's built-in filter then scores items against the typed search text using the code, not the name, which can mark items disabled/hidden and swallow pointer selection.

## Solution

Likely fix: disable cmdk's internal filtering since filtering is done manually — add `shouldFilter={false}` to the `<Command>` root in CountryPicker.tsx. Alternatively drop the manual filter and let cmdk filter with `value={`${country.name} ${country.dialCode}`}`. Verify by running the app, opening the country picker on the login phone step, and clicking a row (both with and without a search query typed).

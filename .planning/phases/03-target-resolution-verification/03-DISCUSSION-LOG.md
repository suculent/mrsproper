# Phase 3: Target Resolution & Verification - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-11
**Phase:** 3-Target Resolution & Verification
**Areas discussed:** Target input design, Phone lookup side-effect, Identity card & confirmation, Failure states & retry

---

## Target input design

| Option | Description | Selected |
|--------|-------------|----------|
| Smart single field | Auto-detects @username vs phone with detected-mode indicator | ✓ |
| Tabs/toggle Username \| Phone | Explicit mode switch reusing country picker | |
| Two always-visible fields | Both inputs shown, user fills one | |

**User's choice:** Smart single field (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Require international (+420…) | Phone only detected with leading + | |
| Accept bare digits, assume country | Country guess with visible, changeable chip | ✓ |
| You decide | Claude picks at planning | |

**User's choice:** Accept bare digits with country guess — friendlier; mitigated by visible chip
**Notes:** User deliberately chose the friendlier option over the recommended stricter one.

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit button + Enter | One deliberate governor-routed call per attempt | ✓ |
| Debounced auto-lookup | Resolve ~800ms after typing stops | |

**User's choice:** Explicit button + Enter (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, normalize links | Strip t.me/, @, link forms on paste | ✓ |
| No, plain input only | Hint to paste username, not link | |

**User's choice:** Normalize links (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| No history in v1 | Sensitive data; clean sessions | ✓ |
| Recent targets dropdown | Last ~5 targets via electron-store | |

**User's choice:** No history in v1 (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Not in v1 | Digits = phone; ID lookup unreliable without access_hash | ✓ |
| Support id:12345 prefix | Power-user dialog-scan fallback | |

**User's choice:** Not in v1 (recommended)

---

## Phone lookup side-effect

| Option | Description | Selected |
|--------|-------------|----------|
| Import → resolve → auto-delete | Silent import + automatic contact cleanup | |
| Import and leave in contacts | Simplest, pollutes contact list | |
| Ask per lookup | Dialog each time: keep or remove | ✓ |

**User's choice:** Ask per lookup — user wants per-case control over the contact list
**Notes:** Deviation from the recommended auto-delete; user prefers explicit choice.

| Option | Description | Selected |
|--------|-------------|----------|
| Inline hint near field | Note when phone mode detected | ✓ |
| One-time dialog first use | Modal explanation with "Got it" | |
| No disclosure | Invisible plumbing | |

**User's choice:** Inline hint near field (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| After successful resolution | Dialog post-lookup; failed lookups auto-clean | ✓ |
| Before the lookup | Consent-style up-front | |

**User's choice:** After successful resolution (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Resolve directly, never touch it | Keep/remove only for app-imported contacts | ✓ |
| Same dialog anyway | Offer removal even for pre-existing | |

**User's choice:** Never touch pre-existing contacts (recommended)

---

## Identity card & confirmation

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit confirm button | "Yes, this is the person" gates next step | ✓ |
| Passive display, continue freely | Informational card only | |

**User's choice:** Explicit confirm button (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Initials + explicit notice | Telegram-style initials + degraded-verification note | ✓ |
| Initials only, no notice | Cleaner, less honest | |
| Generic silhouette icon | Neutral placeholder | |

**User's choice:** Initials + explicit notice (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Required set + last-seen/premium | Name, @username, ID, bio + free signals from User object | ✓ |
| Just the required set | Exactly per VRF-02 | |

**User's choice:** Required set + extra signals (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| 'Change target' resets flow | Clears target + downstream state | ✓ |
| Locked until job done | Fixed once confirmed | |

**User's choice:** Change target resets flow (recommended)

---

## Failure states & retry

| Option | Description | Selected |
|--------|-------------|----------|
| Inline error under field | Cause-specific, input stays editable (Phase 1 pattern) | ✓ |
| Error card in results area | Renders where identity card would appear | |

**User's choice:** Inline error under field (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Cause + actionable hint | Guides admin to alternate path | ✓ |
| Cause only, terse | Short and clean | |

**User's choice:** Cause + actionable hint (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse countdown pattern | Disabled button + live countdown via OP_GOVERNOR_EVENT | ✓ |
| Plain error, manual retry | No live countdown wiring | |

**User's choice:** Reuse countdown pattern (recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Warn but allow | Badge for deleted account / bot; removal still allowed | ✓ |
| No special treatment | Show what Telegram returns | |
| Block these targets | Refuse to confirm | |

**User's choice:** Warn but allow (recommended)

---

## Claude's Discretion

- Detected-mode indicator design; country-guess source (locale vs IP)
- Card layout details and copy wording
- Resolution state location in store; IPC channel naming
- How resolved target state is exposed to Phase 4

## Deferred Ideas

- Recent-targets history (electron-store) — deliberately excluded from v1
- Numeric-ID / `id:` prefix input — power-user path, out of v1 scope
- VRF-04 common-groups count — lands naturally with Phase 4 enumeration

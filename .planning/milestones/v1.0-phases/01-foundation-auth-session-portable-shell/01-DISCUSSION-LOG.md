# Phase 1: Foundation — Auth, Session & Portable Shell - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-10
**Phase:** 1-Foundation — Auth, Session & Portable Shell
**Areas discussed:** Login flow presentation, Post-login landing, Login error handling, Logout behavior

---

## Login Flow Presentation

| Option | Description | Selected |
|--------|-------------|----------|
| Stepped screens | Distinct phone → code → 2FA screens, one at a time | ✓ |
| Single progressive screen | One screen revealing fields inline | |

**User's choice:** Stepped screens

| Option | Description | Selected |
|--------|-------------|----------|
| Country picker + number | Dropdown country (flag + dial code) + separate national-number field | ✓ |
| Single international field | One field, full +<cc><number> | |

**User's choice:** Country picker + number

| Option | Description | Selected |
|--------|-------------|----------|
| Manual entry + hint | Type code; UI says where it was sent | ✓ |
| Manual entry, minimal | Just a code field | |

**User's choice:** Manual entry + hint

| Option | Description | Selected |
|--------|-------------|----------|
| Inline spinner + disabled | Spinner on button, inputs disable until response | ✓ |
| Full-screen loader | Blocking overlay between steps | |

**User's choice:** Inline spinner + disabled

---

## Post-Login Landing

| Option | Description | Selected |
|--------|-------------|----------|
| Account + ready placeholder | Identity + placeholder for coming workflow + logout | |
| Minimal account bar | Small "logged in as X / Logout" bar | |
| Full shell, stubbed | Lay out eventual workflow UI now, non-functional | ✓ |

**User's choice:** Full shell, stubbed
**Notes:** Workflow regions (target input, group list) laid out as non-functional placeholders in Phase 1; real behavior in Phases 3–6. Treated as layout scaffolding, not scope creep.

| Option | Description | Selected |
|--------|-------------|----------|
| Name + @username + photo | Full identity confirmation | ✓ |
| Just name or phone | Minimal identity | |

**User's choice:** Name + @username + photo

---

## Login Error Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Inline error, stay on step | Error under code field, retry + resend | ✓ |
| Restart from phone | Bounce to phone step on any code error | |

**User's choice:** Inline error, stay on step

| Option | Description | Selected |
|--------|-------------|----------|
| Countdown + explanation | "Try again in N seconds" live countdown, disabled submit | ✓ |
| Generic try-later | Plain "try again later" | |

**User's choice:** Countdown + explanation
**Notes:** Flagged as cross-phase dependency — the FLOOD_WAIT logic formally belongs to the Phase 2 governor.

| Option | Description | Selected |
|--------|-------------|----------|
| Validate then server error | Format-validate before send; surface Telegram rejection inline | ✓ |
| Server error only | Send as-is, rely on Telegram error | |

**User's choice:** Validate then server error

---

## Logout Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Confirm dialog | "Log out? You'll need to sign in again with a code." | ✓ |
| Immediate logout | One click, no confirmation | |

**User's choice:** Confirm dialog

| Option | Description | Selected |
|--------|-------------|----------|
| In the account/identity area | Next to name/avatar | |
| App settings/menu | In settings panel or app menu | ✓ |

**User's choice:** App settings/menu

| Option | Description | Selected |
|--------|-------------|----------|
| Wipe local anyway + warn | Always clear local session; warn if server revoke unconfirmed | ✓ |
| Block logout on failure | Keep logged in if revoke fails | |

**User's choice:** Wipe local anyway + warn

---

## Claude's Discretion

- App window sizing, single-window behavior, system-tray presence
- First-run welcome screen
- Session-expiry / AUTH_KEY-invalidation handling (default: route back to login with a brief notice)

## Deferred Ideas

- Credential kill-switch / remote rotation (CRED-01) — v2
- User-supplied api_id (CRED-02), QR login (AUTH-06), multi-account switcher (AUTH-07) — v2
- Responsible-use / consequences warning — Phase 6 (safety gates)

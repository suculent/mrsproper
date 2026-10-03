# Phase 15: Renderer — Add Mode, Contacts, Template & Reporting - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-04
**Phase:** 15-renderer-add-mode-contacts-template-reporting
**Mode:** `--auto` — no interactive prompts; Claude selected the recommended option for every question. The user reviews the outcome at UAT.
**Areas discussed:** Mode switch placement, Add-mode checklist semantics, Contacts checkbox timing, Template editor and preview, Add review screen, Run progress and report, Log export entry point, Resume prompt

---

## Mode switch placement

| Option | Description | Selected |
|--------|-------------|----------|
| Segmented control in the groups pane header, replaces the review-screen 3-way picker | Single source of truth; review screen shows only the actions for the chosen mode (Kick/Ban toggle under Remove) | ✓ |
| Keep the review-screen Kick/Ban/Tag picker and add a separate Add toggle on the pane | Two places to choose, risk of disagreement between pane and review | |
| Mode as a Settings preference persisted across launches | Hidden state; a destructive default could surprise the admin | |

**Auto-selected:** first option (recommended default). Mode not persisted; defaults to Remove; switching clears the selection and re-partitions without rescanning.
`[auto] Mode switch — Q: "Where does the Remove/Tag/Add choice live and does it persist?" → Selected: "Groups-pane segmented control, session-only, Remove default"`

---

## Add-mode checklist semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-check `canAdd` rows with status not-member or banned; grey the rest below with existing reasons; banned rows carry an "unban first" note | Matches Phase 13 D-02/D-07 and PROJECT.md | ✓ |
| Pre-check only not-member rows; banned rows unchecked by default | Adds friction for the common serial-bad-actor case | |

**Auto-selected:** first option.
`[auto] Checklist — Q: "Which rows are pre-checked in Add mode and how are banned rows shown?" → Selected: "not-member + banned pre-checked, banned note shown"`

---

## Contacts checkbox timing

| Option | Description | Selected |
|--------|-------------|----------|
| Checkbox visible in Add mode on resolved and confirmed card; dispatch at target confirmation, or at run confirmation if Add mode was entered later | Honours ADD-05 and Phase 14 D-08 while covering the late-switch case | ✓ |
| Dispatch only at run confirmation | Simpler, but contradicts ADD-05's "on target confirmation" | |
| Dispatch immediately when the box is checked | Fires before the admin has confirmed the person | |

**Auto-selected:** first option. Failure shows a quiet inline notice (Phase 14 deferred follow-on).
`[auto] Contacts — Q: "When is the contact add dispatched and how is a failure shown?" → Selected: "at target confirmation (fallback: run confirmation), non-blocking inline notice"`

---

## Template editor and preview

| Option | Description | Selected |
|--------|-------------|----------|
| Editor and preview together on the Add review screen; `{links}` required; preview substitutes name and shows a placeholder line for links | Keeps ADD-12's "exact rendered text" next to its editor | ✓ |
| Editor in the Settings menu, preview on the review screen | Splits the loop between two places | |
| Modal editor opened from the review screen | Extra layer for a one-field edit | |

**Auto-selected:** first option. Render helper shared between main and renderer.
`[auto] Template — Q: "Where is the template edited and how is the preview rendered before links exist?" → Selected: "review-screen section, placeholder links line, {links} required"`

---

## Add review screen

| Option | Description | Selected |
|--------|-------------|----------|
| Consequence line + group list with mechanic notes + single confirm button; deleted/bot target blocks confirm | Mirrors removal/tag review; adds Phase 14 D-05 guard in the UI | ✓ |
| Add a second confirmation dialog | Not required by ADD-12 and inconsistent with Remove/Tag | |

**Auto-selected:** first option.
`[auto] Review — Q: "What does the Add review screen show and how many confirmations?" → Selected: "one explicit confirm, mechanic notes, deleted/bot blocked"`

---

## Run progress and report

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse groups-pane run/report via a new addStore (tag shape + removal retry); privacy-blocked rows show the link with Copy and the Premium hint; DM status line in summary | Maximum reuse, links always recoverable | ✓ |
| Separate Add report screen | Diverges from the established report UI | |
| Hide links in the report once the DM is sent | Loses the fallback when the DM is refused | |

**Auto-selected:** first option.
`[auto] Report — Q: "How are links, Premium hint and DM status surfaced?" → Selected: "inline link + Copy, hint line, DM status line in summary"`

---

## Log export entry point

| Option | Description | Selected |
|--------|-------------|----------|
| Button in the report stage and an entry in the Settings menu; main opens a save dialog and copies add-log.txt | Reachable after a run and any time later | ✓ |
| Report-stage button only | Log is kept forever but unreachable without a fresh run | |
| Auto-export after every run | Unwanted file writes outside userData | |

**Auto-selected:** first option.
`[auto] Export — Q: "Where can the admin export the add log?" → Selected: "report button + Settings entry, save dialog in main"`

---

## Resume prompt

| Option | Description | Selected |
|--------|-------------|----------|
| Independent AddResumeJobDialog mirroring TagResumeJobDialog; Resume sets Add mode and starts the remaining ids | Matches the tag/removal pattern and Phase 14 D-20 continuation | ✓ |
| Fold Add resume into the existing removal dialog | Three job types in one dialog, harder to read | |

**Auto-selected:** first option.
`[auto] Resume — Q: "How is an incomplete add job surfaced on launch?" → Selected: "dedicated dialog, Resume adding / Discard job"`

---

## Claude's Discretion

Component and file names, layout details, exact note wording, whether links are inline or behind a toggle, how the mode value is threaded, and the unit-test split (pure helpers tested, components at UAT).

## Deferred Ideas

Persisting the mode across launches; Settings-menu template editing or multiple templates; regenerating links from the report; a richer Premium upsell; exporting the job file or report.

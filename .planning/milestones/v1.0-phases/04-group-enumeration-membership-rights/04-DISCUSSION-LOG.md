# Phase 4: Group Enumeration, Membership & Rights - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-11
**Phase:** 4-group-enumeration-membership-rights
**Areas discussed:** Group list ordering & rows, Scan progress UX, Layout & flow timing, Refresh & target-change

---

## Folded Todos (pre-discussion)

| Option | Description | Selected |
|--------|-------------|----------|
| Fold both | Czechia +420 default + clickable country rows ride along with Phase 4 UI work | ✓ |
| Czechia +420 default only | Fold just the default-country fix | |
| Clickable rows only | Fold just the row-click fix | |
| Keep separate | Leave both as pending todos | |

**User's choice:** Fold both

---

## Group list ordering & rows

| Option | Description | Selected |
|--------|-------------|----------|
| Actionable first | Actionable at top, greyed at bottom | ✓ (extended) |
| Alphabetical throughout | One A–Z list | |
| By member count | Biggest communities first | |

**User's choice:** "Actionable groups always first, with additional sorting options: A-Z (default), Member count" — actionable-first sectioning plus a user-selectable sort toggle within sections.

| Option | Description | Selected |
|--------|-------------|----------|
| Avatar + name + members | Avatar, name, member count, checkbox | ✓ |
| Name + checkbox only | Minimal density | |
| Full detail | + type badge and admin role on every row | |

| Option | Description | Selected |
|--------|-------------|----------|
| Inline subtext | Muted line under group name, always visible | ✓ |
| Tooltip on hover | Reason on hover | |
| Badge | Compact reason badge | |

| Option | Description | Selected |
|--------|-------------|----------|
| Only on greyed rows | Type badge where it explains non-actionability | ✓ |
| On every row | Always visible | |
| Nowhere | Plain-word reasons only | |

---

## Scan progress UX

| Option | Description | Selected |
|--------|-------------|----------|
| Stream rows in | Verified groups appear as checks complete, "checked 12/47" progress | ✓ |
| Spinner then full list | Single loading state | |
| All groups upfront, badges resolve | Rows resolve in place | |

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, interact live | Verified rows immediately toggleable | ✓ |
| Read-only until done | Lock until scan completes | |

| Option | Description | Selected |
|--------|-------------|----------|
| Greyed with retry | "Couldn't verify — retry" inline + per-row retry | ✓ |
| Drop silently, note in count | Omit failed groups | |
| Abort whole scan | Any failure stops scan | |

| Option | Description | Selected |
|--------|-------------|----------|
| Eager at login | Fetch dialog list right after auth | ✓ |
| Lazy on first need | Fetch on first target/search | |

---

## Layout & flow timing

| Option | Description | Selected |
|--------|-------------|----------|
| After login, always | Authenticated shell permanently two-pane | ✓ |
| Only after target confirmed | Widen mid-flow | |

| Option | Description | Selected |
|--------|-------------|----------|
| New default + min size | ~1280×800 default, ~1080×680 min, flex 1/3:2/3 | ✓ |
| Fixed window | Locked size | |
| Responsive collapse | Breakpoint stacking | |

| Option | Description | Selected |
|--------|-------------|----------|
| Target input → card | Phase 3 components relocated to left pane | ✓ |
| Stepper sidebar | Wizard stepper anticipating Phase 6 | |

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, two modes | Browse (all groups + search) → checklist (verified) | ✓ |
| Checklist only | Pane empty until target confirmed | |

---

## Refresh & target-change

| Option | Description | Selected |
|--------|-------------|----------|
| Reset to browse mode | Checklist clears on Change target; auto re-scan on next confirm | ✓ |
| Keep last results visible | Stale list stays until new confirm | |

| Option | Description | Selected |
|--------|-------------|----------|
| Login + manual refresh | Session cache + refresh button | ✓ |
| Re-fetch per target confirm | Refresh at every scan | |
| Auto-refresh on interval | Background re-fetch | |

| Option | Description | Selected |
|--------|-------------|----------|
| Always re-scan | Fresh membership/rights on every confirm | ✓ |
| Cache per target for session | Reuse previous scan | |

---

## Claude's Discretion

- Empty states, member-count formatting, progress-indicator styling, list virtualization, scan pacing within governor constraints
- GramJS API mapping for per-chat-type rights detection (researcher resolves)

## Deferred Ideas

None — discussion stayed within phase scope.

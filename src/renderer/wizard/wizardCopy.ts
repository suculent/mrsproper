// All user-facing strings for Phase 6 wizard (SAF-01/02/03). No hardcoded strings in components —
// i18n hygiene per ROADMAP Phase 8. Pattern: removalCopy.ts

import type { GroupType } from '@shared/groupTypes'

// ---------------------------------------------------------------------------
// Helpers (private) — plural inflection utilities
// ---------------------------------------------------------------------------

function s(n: number): string {
  return n === 1 ? '' : 's'
}

// ---------------------------------------------------------------------------
// wizardCopy — all UI strings for Phase 6 wizard screens and components
// ---------------------------------------------------------------------------

export const wizardCopy = {
  // --- Step indicator ---

  stepIndicatorAria: "Removal steps",

  stageLabel: {
    target: "Target",
    groups: "Groups",
    review: "Review",
    run: "Run",
    report: "Report",
  },

  // --- Review screen ---

  reviewTitle: "Review removal",

  severityLabel: "Action",

  severityGroupAria: "Removal action",

  severityKick: "Kick",

  severityBan: "Ban",

  // --- Confirm button ---

  confirmLabel(severity: 'kick' | 'ban', name: string, n: number): string {
    if (severity === 'ban') return `Ban ${name} from ${n} group${s(n)}`
    return `Kick ${name} from ${n} group${s(n)}`
  },

  confirmAriaLabel(severity: 'kick' | 'ban', name: string, n: number): string {
    if (severity === 'ban') return `Ban ${name} from ${n} group${s(n)}`
    return `Kick ${name} from ${n} group${s(n)}`
  },

  // --- Back navigation ---

  editSelection: "Edit selection",

  // --- Run trigger (GroupsPane toolbar) ---

  runTriggerLabel(n: number): string {
    return `Review removal of ${n} group${s(n)}`
  },

  runTriggerAria(n: number): string {
    return `Review removal of ${n} group${s(n)}`
  },

  // --- Totals line ---

  totalsRemoving(n: number): string {
    return `Removing from ${n} group${s(n)}`
  },

  totalsExcluded(n: number): string {
    return `${n} excluded (no removal rights)`
  },

  totalsCantBlock(n: number): string {
    return `${n} can't block rejoin`
  },

  totalsEmpty: "No groups selected — go back and check at least one group.",

  // --- Mechanic notes (dry-run) — locked semantics from UI-SPEC ---

  mechanicNote(type: GroupType, severity: 'kick' | 'ban'): string {
    if (type === 'basic-group') {
      if (severity === 'ban') return "Will be removed — rejoin can't be blocked in basic groups"
      return "Will be removed — can rejoin later"
    }
    if (severity === 'ban') return "Will be banned — can't rejoin until you unban them"
    return "Will be removed — can rejoin later"
  },

  // --- Group list ---

  memberCount(n: number): string {
    return `${n} member${s(n)}`
  },

  groupListAria: "Groups the target will be removed from",

  // --- Report stage ---

  removeSomeoneElse: "Remove someone else",

  // --- GroupsPane checklist toolbar ---

  changeTarget: "Change target",
  changeTargetAria: "Clear current target and return to the target step",
} as const

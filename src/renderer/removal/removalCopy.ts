// All user-facing strings for the removal execution engine (Phase 5, RMV-01/RMV-02/EXE-04/EXE-05).
// No hardcoded strings in components — i18n hygiene per ROADMAP Phase 8.
// Both severity variants defined now; Phase 5 renders the ban variants (hardcoded test default).
// Pattern: groupsCopy.ts — Record<TypedCode, string> + helper functions.

import type { RmvErrorCode } from '@shared/removalTypes'

// ---------------------------------------------------------------------------
// Error copy — maps all RmvErrorCode values to human-readable cause text.
// Rendered as: "{reason} retry removal" — reads as one sentence with the link.
// T-05-06-C mitigation: no raw RPC error codes exposed to the user.
// ---------------------------------------------------------------------------

export const RMV_ERROR_COPY: Record<RmvErrorCode, string> = {
  'RMV_TARGET_IS_ADMIN': "They're an admin here — make them a regular member in Telegram first, then",
  'RMV_NO_RIGHTS': "You no longer have removal rights in this group —",
  'RMV_USER_INVALID': "Connection dropped — check your network, then",
  'RMV_CHANNEL_PRIVATE': "Telegram refused this removal —",
  'NETWORK': "Connection dropped — check your network, then",
  'UNKNOWN': "Telegram refused this removal —",
}

// ---------------------------------------------------------------------------
// Helpers (private) — plural inflection utilities
// ---------------------------------------------------------------------------

function s(n: number): string {
  return n === 1 ? '' : 's'
}

function themIt(n: number): string {
  return n === 1 ? 'it' : 'them'
}

// ---------------------------------------------------------------------------
// removalCopy — all UI strings keyed by severity or context
// ---------------------------------------------------------------------------

export const removalCopy = {
  // --- Confirm dialog ---

  confirmTitle(severity: 'kick' | 'ban', name: string, n: number): string {
    if (severity === 'ban') return `Ban ${name} from ${n} group${s(n)}?`
    return `Remove ${name} from ${n} group${s(n)}?`
  },

  confirmDestructive(severity: 'kick' | 'ban', n: number): string {
    if (severity === 'ban') return `Ban from ${n} group${s(n)}`
    return `Remove from ${n} group${s(n)}`
  },

  confirmNeutral: "Keep them",

  confirmDispatching: "Starting…",

  severityLine(severity: 'kick' | 'ban', n: number): string {
    if (severity === 'ban') {
      return `They'll be banned from all ${n} selected group${s(n)} and can't rejoin until you unban them in Telegram.`
    }
    return `They'll be removed from all ${n} selected group${s(n)}, but they can rejoin later.`
  },

  // --- Run-trigger button ---

  runTriggerLabel(severity: 'kick' | 'ban', n: number): string {
    if (severity === 'ban') return `Ban from ${n} group${s(n)}…`
    return `Remove from ${n} group${s(n)}…`
  },

  // --- Stop / abort ---

  stopLabel: "Stop removal",

  stoppingLabel: "Stopping…",

  // --- Per-row retry link ---

  retryRowLabel: "retry removal",

  // --- Progress indicator ---

  progressLabel(name: string, x: number, n: number): string {
    return `Removing ${name} from group ${x} of ${n}…`
  },

  floodWaitSubline: "Telegram asked us to slow down — resuming automatically.",

  // --- Resume / Discard dialog ---

  resumeTitle(name: string): string {
    return `Finish removing ${name}?`
  },

  resumeBody(x: number, n: number): string {
    return `${x} of ${n} groups were processed before the run stopped. Resuming continues from the first unprocessed group.`
  },

  resumeDestructive: "Resume removal",

  resumeNeutral: "Discard job",

  // --- PEER_FLOOD banner ---

  peerFloodBanner: "Telegram has flagged this account for too many actions. Wait a few hours before resuming — your progress is saved and the job can continue from where it stopped.",

  peerFloodResumeLabel: "Resume removal",

  // --- Per-row status sublines ---

  rowStatus: {
    removing: "Removing…",
    doneBan: "Banned",
    doneKick: "Removed",
    doneBasicFallback: "Removed — rejoin can't be blocked in basic groups",
    alreadyGone: "Already gone",
    skipped: "Skipped — removal stopped",
  },

  // --- Summary band ---

  summaryLine(counts: { removed: number; alreadyGone: number; failed: number; skipped: number }): string {
    const parts: string[] = []
    if (counts.removed > 0) parts.push(`Removed ${counts.removed}`)
    if (counts.alreadyGone > 0) parts.push(`Already gone ${counts.alreadyGone}`)
    if (counts.failed > 0) parts.push(`Failed ${counts.failed}`)
    if (counts.skipped > 0) parts.push(`Skipped ${counts.skipped}`)
    return parts.join(' · ')
  },

  summaryFailed(n: number): string {
    return `${n} removal${s(n)} failed. You can retry ${themIt(n)} in the list.`
  },

  summaryStopped(x: number, n: number): string {
    return `Removal stopped — ${x} of ${n} processed.`
  },

  summaryTimestamp(isoString: string): string {
    return `Finished ${new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(isoString))}`
  },
} as const

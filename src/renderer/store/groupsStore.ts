// UI mirror of GroupsState + ScanState fed by IPC subscriptions.
// Uses React useSyncExternalStore pattern with ref-counted subscription lifecycle.
// Mirrors src/renderer/store/targetStore.ts exactly — standard external store pattern.
// Pre-checks all actionable member groups when scan completes (D-02, D-06).

import { useSyncExternalStore } from 'react'
import type { GroupsState, ScanState } from '@shared/groupTypes'
import { groupsClient } from '../ipc/groupsClient'
import { isActionableForMode, type GroupMode } from '../groups/modeRules'

interface GroupsStoreState {
  groups: GroupsState
  scan: ScanState
  // Checked-set for removal: Set of dialogIds the user wants to remove from.
  // Initialized to all actionable member groups when scan completes (pre-checked, D-02, D-06).
  checkedDialogIds: Set<string>
}

type Listener = () => void

let currentState: GroupsStoreState = {
  groups: { step: 'idle' },
  scan: { step: 'idle' },
  checkedDialogIds: new Set(),
}

const listeners = new Set<Listener>()

// CR-03: tracks the scan step seen on the previous onScanState call.
// Initialized null so the first 'complete' event (transitioning from 'scanning')
// is correctly identified as the first-completion and triggers the pre-check rebuild.
// Module-level (like currentState and listeners) so it persists across React renders
// and hook re-subscriptions.
let _prevScanStep: ScanState['step'] | null = null

// 15-14: tracks the currently-active checklist mode. recomputeCheckedForMode(mode) is the
// only call site that ever changes the active mode (invoked synchronously by
// ModeSwitch.handleSelect on every mode switch, before onChange bubbles up), so recording it
// there keeps this module-level value in sync with zero new call sites elsewhere. Consumed by
// the first-scan-complete pre-check rebuild below so it no longer hardcodes 'remove'.
let _activeMode: GroupMode = 'remove'

function notify(): void {
  for (const l of listeners) l()
}

function setState(next: Partial<GroupsStoreState>): void {
  currentState = { ...currentState, ...next }
  notify()
}

// Subscriptions are started once when the first component subscribes.
// The unsubscribe functions are stored so they can be called on cleanup.
let groupsStateSub: (() => void) | null = null
let scanStateSub: (() => void) | null = null
let refCount = 0

function startSubscriptions(): void {
  if (refCount > 0) return
  refCount++

  groupsStateSub = groupsClient.onGroupsState((s: GroupsState) => {
    setState({ groups: s })
  })

  scanStateSub = groupsClient.onScanState((s: ScanState) => {
    if (s.step === 'complete') {
      if (_prevScanStep !== 'complete') {
        // D-02, D-06 / CR-03: first 'complete' transition (from 'scanning').
        // Pre-check all verified-member actionable groups. checkedDialogIds is
        // rebuilt only on this first completion — not on retry-complete — so that
        // manual deselections the user made survive retryGroup() emissions.
        const groups = currentState.groups
        if (groups.step === 'loaded') {
          // D-03/D-05: route through the single shared predicate so this rebuild can
          // never silently drift from GroupsPane.tsx's partition (Pitfall 2) or from
          // recomputeCheckedForMode's mode-switch rebuild below.
          const checkedDialogIds = new Set(
            groups.dialogs
              .filter((d) => {
                const result = s.results.find((r) => r.dialogId === d.id)
                const status = result ? result.status : null
                return isActionableForMode(d, status, _activeMode)
              })
              .map((d) => d.id)
          )
          setState({ scan: s, checkedDialogIds })
          _prevScanStep = s.step
          return
        }
      } else {
        // CR-03: retry-complete — scan step was already 'complete' before this event.
        // Update scan state without rebuilding checkedDialogIds to preserve manual
        // deselections the user made since the last first-completion.
        setState({ scan: s })
        _prevScanStep = s.step
        return
      }
    }
    // idle / scanning / error branches — update scan state and track step
    setState({ scan: s })
    _prevScanStep = s.step
  })

  // Bootstrap current state from main on first subscription
  void groupsClient.getGroupsState().then((s: GroupsState) => {
    setState({ groups: s })
  })
}

function stopSubscriptions(): void {
  refCount--
  if (refCount > 0) return
  groupsStateSub?.()
  scanStateSub?.()
  groupsStateSub = null
  scanStateSub = null
}

// External store subscription function (for useSyncExternalStore)
function subscribe(listener: Listener): () => void {
  if (listeners.size === 0) startSubscriptions()
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) stopSubscriptions()
  }
}

function getSnapshot(): GroupsStoreState {
  return currentState
}

function getServerSnapshot(): GroupsStoreState {
  return currentState
}

// Hook for components to access groups + scan state
export function useGroupsStore(): GroupsStoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

// Intent dispatchers — delegate to groupsClient; update store from returned state
export const groupsActions = {
  async startScan(): Promise<void> {
    try {
      const s = await groupsClient.startScan()
      setState({ scan: s })
    } catch (err) {
      console.error('[groupsStore] startScan error:', err)
    }
  },

  async abortScan(): Promise<void> {
    try {
      await groupsClient.abortScan()
    } catch (err) {
      console.error('[groupsStore] abortScan error:', err)
    }
  },

  async retryScanGroup(dialogId: string): Promise<void> {
    try {
      await groupsClient.retryScanGroup(dialogId)
    } catch (err) {
      console.error('[groupsStore] retryScanGroup error:', err)
    }
  },

  async refreshGroups(): Promise<void> {
    try {
      const s = await groupsClient.refreshGroups()
      setState({ groups: s })
    } catch (err) {
      console.error('[groupsStore] refreshGroups error:', err)
    }
  },

  // D-03: local toggle — no IPC call; purely renderer-side checked-set mutation
  toggleGroup(dialogId: string): void {
    const next = new Set(currentState.checkedDialogIds)
    if (next.has(dialogId)) next.delete(dialogId)
    else next.add(dialogId)
    setState({ checkedDialogIds: next })
  },

  // D-03: rebuilds checkedDialogIds for the given mode from the current scan snapshot,
  // without triggering a new scan. Called by the mode-switch control (Plan 15-09) on
  // every mode change so the checked-set never goes stale against the new partition rule
  // (RESEARCH.md Pitfall 3). No-ops when groups/scan state isn't ready to be partitioned.
  recomputeCheckedForMode(mode: GroupMode): void {
    _activeMode = mode
    const groups = currentState.groups
    const scan = currentState.scan
    if (groups.step !== 'loaded') return
    if (scan.step !== 'scanning' && scan.step !== 'complete') return
    const checkedDialogIds = new Set(
      groups.dialogs
        .filter((d) => {
          const result = scan.results.find((r) => r.dialogId === d.id)
          const status = result ? result.status : null
          return isActionableForMode(d, status, mode)
        })
        .map((d) => d.id)
    )
    setState({ checkedDialogIds })
  },
}

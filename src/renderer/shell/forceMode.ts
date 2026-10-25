// Programmatic mode switch that mirrors ModeSwitch.handleSelect (D-03): sync the
// groupsStore active mode / pre-check set first, then flip the AppShell mode.
// Audit W2 (ADD-02): bare setMode() left groupsStore._activeMode stale at 'remove'.
import { groupsActions } from '../store/groupsStore'
import type { GroupMode } from '../groups/modeRules'

export function forceMode(mode: GroupMode, setMode: (m: GroupMode) => void): void {
  groupsActions.recomputeCheckedForMode(mode)
  setMode(mode)
}

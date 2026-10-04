/**
 * Shared run-activity rule (D-15): true when any Remove, Tag or Add run is
 * running or stopping. Same rule as GroupsPane.isRunActive.
 */
export function isAnyRunActive(
  removal: { step: string },
  tag: { step: string },
  add: { step: string }
): boolean {
  const active = (s: { step: string }): boolean => s.step === 'running' || s.step === 'stopping'
  return active(removal) || active(tag) || active(add)
}

// Logout / session-wipe cleanup for the Add feature (audit W4, ADD-08/12).
// Runs inside the logout path: every step is isolated and never throws.
// Deliberately logs nothing about the target (no PII / access hashes).

export interface AddSessionWipeDeps {
  addExecutor: { resetForSessionWipe(): void } | null
  addAuditStore: { clearJob(): void } | null
  resolver: { reset(): void } | null
}

export function wipeAddSessionState(deps: AddSessionWipeDeps): void {
  const steps: Array<[string, (() => void) | undefined]> = [
    ['add executor reset', deps.addExecutor ? () => deps.addExecutor!.resetForSessionWipe() : undefined],
    ['add job clear', deps.addAuditStore ? () => deps.addAuditStore!.clearJob() : undefined],
    ['resolver reset', deps.resolver ? () => deps.resolver!.reset() : undefined],
  ]
  for (const [name, fn] of steps) {
    if (!fn) continue
    try {
      fn()
    } catch (err) {
      console.error(`[sessionWipe] ${name} failed:`, err instanceof Error ? err.message : 'unknown error')
    }
  }
}

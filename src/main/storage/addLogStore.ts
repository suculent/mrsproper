/**
 * AddLogStore — plain-text, append-only, owner-only add-log.txt writer (D-17/D-18/ADD-14).
 *
 * CONTRACT:
 * - Unlike every other storage module in this codebase (auditStore.ts, tagAuditStore.ts),
 *   this store never overwrites or rewrites prior content. It only appends new blocks via
 *   fs.appendFileSync — the atomic write-to-temp-then-rename pattern does not apply here.
 * - One block per run, written when the run reaches a terminal state (complete, stopped,
 *   or hard-stopped). A resumed run appends a follow-up block that references the original
 *   jobId and is visually marked as a CONTINUATION — nothing is ever rewritten in place.
 * - Failed and skipped dialogs are never logged (D-18) — only 'done' (addedDialogs) and
 *   privacy-blocked-with-link (linkedDialogs) outcomes appear in a block.
 *
 * SECURITY:
 * - add-log.txt contains invite links (bearer-style, single-use secrets). Every
 *   appendFileSync call passes an owner-read-only mode flag, the same protection
 *   level as add-job.json and session.bin (T-14-05).
 */

import type { AddLogBlockEntry } from '@shared/addTypes'

// ── Dependency types ────────────────────────────────────────────────────────

/** Minimal fs surface needed — injectable for tests. */
export interface AddLogStoreFsDeps {
  appendFileSync(path: string, data: string, opts?: unknown): void
  existsSync(path: string): boolean
}

/** Minimal app surface needed — injectable for tests. */
export interface AddLogStoreAppDeps {
  getPath(name: 'userData'): string
}

/** Injectable dependencies for testability (production defaults to real electron/fs). */
export interface AddLogStoreDeps {
  fs?: AddLogStoreFsDeps
  app?: AddLogStoreAppDeps
  /** Override the log file name (default: 'add-log.txt'). */
  logFileName?: string
}

// ── AddLogStore interface ───────────────────────────────────────────────────

export interface AddLogStore {
  /**
   * Append one plain-text block to add-log.txt (D-18). Never truncates or rewrites
   * prior blocks — always appends, with mode 0o600 on every write.
   */
  appendBlock(entry: AddLogBlockEntry): void
}

// ── Block formatting ────────────────────────────────────────────────────────

/**
 * Format one plain-text block for an AddLogBlockEntry.
 *
 * Header carries a literal 'CONTINUATION' marker when isFollowUp is true, satisfying
 * D-18's "visually distinguished, references the original jobId" requirement with a
 * grep-able literal substring.
 */
function formatBlock(entry: AddLogBlockEntry): string {
  const lines: string[] = []

  const header = entry.isFollowUp
    ? `===== ADD RUN ${entry.timestamp} (job ${entry.jobId}, CONTINUATION) =====`
    : `===== ADD RUN ${entry.timestamp} (job ${entry.jobId}) =====`
  lines.push(header)
  lines.push(`Target: ${entry.targetName} (${entry.targetId})`)
  lines.push(`DM status: ${entry.dmStatus}`)
  lines.push('')
  lines.push('Added to:')
  if (entry.addedDialogs.length === 0) {
    lines.push('  (none)')
  } else {
    for (const d of entry.addedDialogs) {
      lines.push(`  - ${d.title ?? d.dialogId}`)
    }
  }
  lines.push('')
  lines.push('Sent as invite link to:')
  if (entry.linkedDialogs.length === 0) {
    lines.push('  (none)')
  } else {
    for (const d of entry.linkedDialogs) {
      lines.push(`  - ${d.title ?? d.dialogId}: ${d.link}`)
    }
  }
  lines.push('')

  return lines.join('\n') + '\n'
}

// ── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create an AddLogStore with injectable dependencies.
 *
 * In production (Electron main process after app.whenReady()):
 *   const store = createAddLogStore()   // uses real node:fs + electron.app
 *
 * In tests (inject fake fs + fake app → no disk I/O, no Electron required):
 *   const store = createAddLogStore({ fs: fakeFs, app: fakeApp })
 */
export function createAddLogStore(deps: AddLogStoreDeps = {}): AddLogStore {
  const logFileName = deps.logFileName ?? 'add-log.txt'

  /** Resolve the fs implementation (injected or lazy-required). */
  function resolveFs(): AddLogStoreFsDeps {
    if (deps.fs) return deps.fs
    // Lazy import to avoid loading node:fs at module parse time in test env
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('node:fs') as AddLogStoreFsDeps
  }

  /** Resolve the app implementation (injected or lazy-required from Electron). */
  function resolveApp(): AddLogStoreAppDeps {
    if (deps.app) return deps.app
    // Lazy import to avoid loading Electron at module parse time in test env
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron') as { app: AddLogStoreAppDeps }
    return app
  }

  /** Compute the absolute path for the log file. */
  function logPath(): string {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { join } = require('node:path') as typeof import('node:path')
    const userData = resolveApp().getPath('userData')
    return join(userData, logFileName)
  }

  return {
    appendBlock(entry: AddLogBlockEntry): void {
      const fs = resolveFs()
      const blockText = formatBlock(entry)
      fs.appendFileSync(logPath(), blockText, { mode: 0o600 })
    },
  }
}

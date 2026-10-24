/**
 * IPC handler registrations for name-based participant search and candidate resolution.
 * The ONLY renderer surface for search operations and candidate-to-target resolution.
 *
 * Security gates:
 *   - T-04.1-07 (search:start): query Zod-validated with z.string().trim().min(2).max(100)
 *     before reaching ParticipantSearcher — rejects empty/short queries (Pitfall 8) and
 *     overlong strings. No explicit auth-state check is performed here (WR-05): an
 *     unauthenticated renderer calling this handler results in GROUPS_NOT_LOADED emitted
 *     by ParticipantSearcher.search() — a graceful, no-API-call failure. This mirrors
 *     the scan:start handler in groupChannels.ts which also carries no auth gate.
 *   - T-04.1-08 (target:resolveCandidate): Zod ResolveCandidateSchema validates userId,
 *     then in-memory gate validates userId is in _candidateAccessHashes before any API call.
 *     Renderer cannot forge a userId that isn't in the current scan's candidate map.
 *   - T-04.1-09 (emitSearchState): win.isDestroyed() guard prevents sending to destroyed
 *     window (T-04-08 pattern). CandidateDTO has no accessHash field.
 *   - T-04.1-10 (TARGET_RESET CR-01): searcher.abortSearch() called first in targetChannels.ts
 *     → _candidateAccessHashes cleared before scan/resolver reset.
 *
 * Modeled exactly on src/main/ipc/groupChannels.ts.
 */

import { ipcMain, BrowserWindow } from 'electron'
import { z } from 'zod'
import type { ParticipantSearcher } from '../telegram/ParticipantSearcher'
import type { TargetResolver } from '../telegram/TargetResolver'
import {
  SEARCH_START,
  SEARCH_ABORT,
  SEARCH_GET_STATE,
  SEARCH_STATE,
  TARGET_RESOLVE_CANDIDATE,
} from '@shared/channels'
import type { SearchState } from '@shared/searchTypes'

// ── Zod schemas for inbound IPC payloads ─────────────────────────────────────
// T-04.1-07: SearchStartSchema — trim then enforce min(2) to reject empty/whitespace queries
// that would waste a governed API round-trip (Pitfall 8 prevention).
// max(100) rejects unbounded strings from a compromised renderer.

const SearchStartSchema = z.object({
  query: z.string().trim().min(2).max(100),
})

// T-04.1-08: ResolveCandidateSchema — userId is a decimal-string Telegram user ID.
// max(20) covers bigint-range IDs (UINT64 max is 18 digits + sign).
// min(1) rejects empty. Zod is layer 1; _candidateAccessHashes gate is layer 2.

const ResolveCandidateSchema = z.object({
  userId: z.string().min(1).max(20),
})

// ── IPC handler registration ───────────────────────────────────────────────────

/**
 * Register all name search and candidate resolution IPC handlers on ipcMain.
 *
 * Handlers (invoke — request/response):
 *   SEARCH_START            — Zod-validates query, calls searcher.search(query) (non-awaited),
 *                             returns current SearchState
 *   SEARCH_ABORT            — calls searcher.abortSearch(), returns new SearchState
 *   SEARCH_GET_STATE        — returns current SearchState from searcher.getState()
 *   TARGET_RESOLVE_CANDIDATE — Zod-validates userId, gates on _candidateAccessHashes,
 *                               calls resolver.resolveByCandidate(), returns resolver state
 *
 * State push (search:state) is wired in main/index.ts via ParticipantSearcher's
 * onStateChange callback → emitSearchState(). Handlers do NOT push state themselves.
 *
 * @param win      The main BrowserWindow
 * @param searcher The ParticipantSearcher instance (constructed in main/index.ts)
 * @param resolver The TargetResolver instance (constructed in main/index.ts)
 */
export function registerSearchChannels(
  win: BrowserWindow,
  searcher: ParticipantSearcher,
  resolver: TargetResolver,
  getAddStep?: () => string // D-05/D-07: lazy getter (AddExecutor is built after this registration)
): void {
  // Suppress unused warning — win used by emitSearchState wired in main/index.ts
  void win

  // ── Handle: search:start ─────────────────────────────────────────────────
  // T-04.1-07: Zod validates query before dispatching to searcher.
  // search() is NOT awaited — it runs async and streams state via onStateChange.
  ipcMain.handle(SEARCH_START, async (_event, payload: unknown) => {
    const parsed = SearchStartSchema.parse(payload) // throws ZodError on malformed input
    // Fire-and-forget — state updates arrive via onStateChange → emitSearchState
    searcher.search(parsed.query).catch(() => {
      // Errors are handled inside search() which emits error state via onStateChange
    })
    return searcher.getState()
  })

  // ── Handle: search:abort ─────────────────────────────────────────────────
  ipcMain.handle(SEARCH_ABORT, async () => {
    searcher.abortSearch()
    return searcher.getState()
  })

  // ── Handle: search:getState ──────────────────────────────────────────────
  ipcMain.handle(SEARCH_GET_STATE, async () => {
    return searcher.getState()
  })

  // ── Handle: target:resolveCandidate ──────────────────────────────────────
  // T-04.1-08: two-layer validation — Zod schema first, then in-memory candidate gate.
  // accessHash is NEVER sent by the renderer — it is retrieved from the private map
  // inside ParticipantSearcher. This is the T-03-01 / T-04.1-01 accessHash isolation.
  ipcMain.handle(TARGET_RESOLVE_CANDIDATE, async (_event, payload: unknown) => {
    // Layer 1: Zod validation — throws ZodError on malformed input
    const parsed = ResolveCandidateSchema.parse(payload)

    // D-05/D-07: name search cannot bypass the add-job lookup lock.
    if (getAddStep && getAddStep() !== 'idle') return resolver.getState()

    // Layer 2: Security gate — userId must be in the current candidate set.
    // getCandidateAccessHash() returns null for unknown userIds or after abortSearch().
    const accessHash = searcher.getCandidateAccessHash(parsed.userId)
    if (accessHash === null) {
      throw new Error('Unknown userId — not in current candidate set')
    }

    // Proceed with resolution — accessHash stays in main process (T-03-01)
    await resolver.resolveByCandidate(BigInt(parsed.userId), accessHash)
    // WR-05: re-check after the await — an add job may have started while resolving.
    if (getAddStep && getAddStep() !== 'idle') resolver.reset()
    return resolver.getState()
  })
}

// ── State push helper ─────────────────────────────────────────────────────────

/**
 * Emit a SearchState event to the renderer.
 * Called by ParticipantSearcher's onStateChange callback (wired in main/index.ts).
 * T-04.1-09 / T-04-08 pattern: gated on !win.isDestroyed() (RESEARCH Pitfall 6).
 * CandidateDTO emitted in SearchState has no accessHash field by construction.
 */
export function emitSearchState(win: BrowserWindow, state: SearchState): void {
  if (!win.isDestroyed()) {
    win.webContents.send(SEARCH_STATE, state)
  }
}

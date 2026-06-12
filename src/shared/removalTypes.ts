// Shared types for the removal execution engine (Phase 5, RMV-01/RMV-02/EXE-04/EXE-05).
// Imported by both main (RemovalExecutor, removalChannels, auditStore) and renderer (removalStore).
// Single source of truth for RemovalState, RemovalGroupOutcome, RemovalJobFile, and RmvErrorCode.
// Modeled exactly on src/shared/searchTypes.ts.

/**
 * Per-group removal failure codes. All carry disposition 'fail'
 * (T-03-02 pattern — non-retryable, continue job).
 */
export type RmvErrorCode =
  | 'RMV_TARGET_IS_ADMIN'
  | 'RMV_NO_RIGHTS'
  | 'RMV_USER_INVALID'
  | 'RMV_CHANNEL_PRIVATE'
  | 'NETWORK'
  | 'UNKNOWN'

/**
 * Step union for RemovalState.
 *
 * 'stopped'      — user aborted (resumable).
 * 'hard-stopped' — PEER_FLOOD (resumable).
 * 'confirming'   — dialog open, not yet dispatched.
 */
export type RemovalRunStep =
  | 'idle'
  | 'confirming'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'complete'
  | 'hard-stopped'

/**
 * Per-group outcome recorded during a removal run.
 * Accumulated in RemovalState.outcomes as the run progresses and persisted in RemovalJobFile.
 */
export interface RemovalGroupOutcome {
  /** Stable numeric chat/channel ID as a decimal string. */
  dialogId: string
  /** Outcome classification for this group. */
  status: 'done' | 'already-gone' | 'failed' | 'skipped'
  /** Typed failure code — only present when status is 'failed'. */
  errorCode?: RmvErrorCode
  /** Annotation when a ban was requested but basic group does not support it. */
  note?: 'basic-group-ban-fallback' | null
  /** ISO timestamp of when this outcome was recorded. */
  timestamp: string
}

/**
 * Summary counts produced when a removal run finishes (complete, stopped, or hard-stopped).
 */
export interface RemovalSummary {
  removed: number
  alreadyGone: number
  failed: number
  skipped: number
  /** ISO timestamp of when the run reached its terminal state. */
  completedAt: string
}

/**
 * Live removal state — streamed from main to renderer via REMOVAL_STATE push channel.
 *
 * Security boundary (T-05-01-A): targetAccessHash is intentionally omitted here — it lives in
 * RemovalJobFile on disk (mode 0o600) and in main process memory only. The renderer receives
 * targetId/targetName for display purposes but never the accessHash.
 */
export interface RemovalState {
  step: RemovalRunStep
  severity: 'kick' | 'ban'
  /** Telegram user ID of the removal target as a decimal string. */
  targetId: string
  /** Display name of the removal target. */
  targetName: string
  /** Processed / total group count for the progress indicator. */
  progress: { processed: number; total: number }
  /** Accumulated per-group outcomes as the run progresses. */
  outcomes: RemovalGroupOutcome[]
  /** Present only when step is 'complete', 'stopped', or 'hard-stopped'. */
  summary?: RemovalSummary
  /** The group currently being processed (undefined between groups). */
  currentGroupId?: string
}

/**
 * Job file schema persisted to userData/removal-job.json after each group outcome.
 *
 * schemaVersion enables future migration without silent data loss.
 * jobId is an ISO timestamp nonce — unique per run, cheap to generate.
 * targetAccessHash stored for resume: on restart the resolver may not be live (user jumped
 * straight to the resume prompt), so the executor reconstructs InputPeerUser from this value.
 * Acceptable risk — the job file is written with mode 0o600 (same as the session file),
 * and accessHash is not a session credential.
 */
export interface RemovalJobFile {
  schemaVersion: 1
  /** ISO timestamp used as a unique nonce for this job. */
  jobId: string
  severity: 'kick' | 'ban'
  /** Telegram user ID of the removal target as a decimal string. */
  targetId: string
  /** Display name of the removal target. */
  targetName: string
  /** Access hash for the target — stored for resume (resolver may be null after restart). */
  targetAccessHash: string
  /** Full ordered list of dialog IDs to process (checklist order from enumeration). */
  dialogIds: string[]
  /** Outcomes checkpointed after each group completes. */
  outcomes: RemovalGroupOutcome[]
  /** ISO timestamp when the job was started. */
  startedAt: string
  /** ISO timestamp when the job reached a terminal state (complete/stopped/hard-stopped). */
  completedAt?: string
  /** Current persistence status — 'running' means the job is incomplete and will prompt Resume/Discard. */
  status: 'running' | 'complete' | 'stopped' | 'hard-stopped'
}

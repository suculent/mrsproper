// Pure type module — no runtime logic. Imported by both main and renderer processes.
// Mirrors src/shared/removalTypes.ts structure.
// Shared types for the tag execution engine (Phase 10, TAG-03/TAG-05).
// Single source of truth for TagState, TagGroupOutcome, TagJobFile, TagErrorCode, and TagRunStep.

/**
 * Per-group tag failure codes.
 *
 * TAG_TARGET_IS_ADMIN — target is already an admin; tagging would overwrite their admin rank
 *   (same field as custom title). Treated as 'skipped' (errorCode distinguishes from basic group).
 * TAG_UNSUPPORTED_BASIC_GROUP — basic groups not supported; call accepted by server but
 *   round-trip unconfirmed; v1 decision: skip. 'skipped' + TAG_UNSUPPORTED_BASIC_GROUP
 *   distinguishes from TAG_TARGET_IS_ADMIN when both result in status 'skipped'.
 * PEER_FLOOD is a run-level hard-stop, not a per-group code — intentionally omitted here.
 */
export type TagErrorCode =
  | 'TAG_TARGET_IS_ADMIN'
  | 'TAG_UNSUPPORTED_BASIC_GROUP'
  | 'TAG_NO_RIGHTS'
  | 'TAG_USER_INVALID'
  | 'TAG_CHANNEL_INVALID'
  | 'NETWORK'
  | 'UNKNOWN'

/**
 * Step union for TagState.
 *
 * 'stopped'      — user aborted (resumable).
 * 'hard-stopped' — PEER_FLOOD (resumable).
 * 'confirming'   — dialog open, not yet dispatched.
 */
export type TagRunStep =
  | 'idle'
  | 'confirming'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'complete'
  | 'hard-stopped'

/**
 * Per-group outcome recorded during a tag run.
 * Accumulated in TagState.outcomes as the run progresses and persisted in TagJobFile.
 *
 * Note: 'skipped' + errorCode distinguishes TAG_TARGET_IS_ADMIN (already an admin — would
 * overwrite their rank) from TAG_UNSUPPORTED_BASIC_GROUP (basic group; tagging not confirmed).
 * There is no 'already-gone' concept for tag — a member either gets tagged, is skipped, or fails.
 */
export interface TagGroupOutcome {
  /** Stable numeric chat/channel ID as a decimal string. */
  dialogId: string
  /** Outcome classification for this group. */
  status: 'done' | 'skipped' | 'failed'
  /** Typed failure/skip code — present when status is 'failed' or 'skipped'. */
  errorCode?: TagErrorCode
  /** ISO timestamp of when this outcome was recorded. */
  timestamp: string
}

/**
 * Summary counts produced when a tag run finishes (complete, stopped, or hard-stopped).
 */
export interface TagSummary {
  tagged: number
  skipped: number
  failed: number
  /** ISO timestamp of when the run reached its terminal state. */
  completedAt: string
}

/**
 * Live tag state — streamed from main to renderer via TAG_STATE push channel.
 *
 * Security boundary (T-10-01): targetAccessHash is intentionally omitted here — it lives in
 * TagJobFile on disk (mode 0o600) and in main process memory only. The renderer receives
 * targetId/targetName for display purposes but never the accessHash.
 */
export interface TagState {
  step: TagRunStep
  /** The tag string to apply across selected groups. */
  tag: string
  /** Telegram user ID of the tag target as a decimal string. */
  targetId: string
  /** Display name of the tag target. */
  targetName: string
  /** Processed / total group count for the progress indicator. */
  progress: { processed: number; total: number }
  /** Accumulated per-group outcomes as the run progresses. */
  outcomes: TagGroupOutcome[]
  /** Present only when step is 'complete', 'stopped', or 'hard-stopped'. */
  summary?: TagSummary
  /** The group currently being processed (undefined between groups). */
  currentGroupId?: string
  /**
   * Seconds remaining in an active FLOOD_WAIT during a tag run. Null when no flood wait is
   * active. Only meaningful when step === 'running'. Scoped to tag-only flood events — NOT
   * from the shared OP_GOVERNOR_EVENT channel.
   */
  floodWaitRemaining?: number | null
}

/**
 * Job file schema persisted to userData/tag-job.json after each group outcome.
 *
 * schemaVersion enables future migration without silent data loss.
 * jobId is an ISO timestamp nonce — unique per run, cheap to generate.
 * targetAccessHash stored for resume: on restart the resolver may not be live (user jumped
 * straight to the resume prompt), so the executor reconstructs InputPeerUser from this value.
 * Acceptable risk — the job file is written with mode 0o600 (same as the session file),
 * and accessHash is not a session credential.
 */
export interface TagJobFile {
  schemaVersion: 1
  /** ISO timestamp used as a unique nonce for this job. */
  jobId: string
  /** The tag string to apply across selected groups. */
  tag: string
  /** Telegram user ID of the tag target as a decimal string. */
  targetId: string
  /** Display name of the tag target. */
  targetName: string
  /** Access hash for the target — stored for resume (resolver may be null after restart).
   *  0o600 protection on disk; never sent to renderer. */
  targetAccessHash: string
  /** Full ordered list of dialog IDs to process (checklist order from enumeration). */
  dialogIds: string[]
  /** Outcomes checkpointed after each group completes. */
  outcomes: TagGroupOutcome[]
  /** ISO timestamp when the job was started. */
  startedAt: string
  /** ISO timestamp when the job reached a terminal state (complete/stopped/hard-stopped). */
  completedAt?: string
  /** Current persistence status — 'running' means the job is incomplete and will prompt Resume/Discard. */
  status: 'running' | 'complete' | 'stopped' | 'hard-stopped'
}

/**
 * Renderer-safe projection of TagJobFile with targetAccessHash stripped.
 *
 * Security boundary (T-10-01): targetAccessHash must NEVER cross the IPC boundary —
 * it lives in the job file (mode 0o600) and in main-process memory only.
 * This type is used as the return type of TAG_GET_JOB so TypeScript enforces the
 * boundary at the call sites in both tagChannels.ts and tagClient.ts.
 */
export type TagJobFileSafe = Omit<TagJobFile, 'targetAccessHash'>

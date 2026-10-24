// Pure type module — no runtime logic. Imported by both main and renderer processes.
// Mirrors src/shared/tagTypes.ts structure (+ src/shared/removalTypes.ts job-file/outcome precedent).
// Shared types for the add execution engine (Phase 14, ADD-06..ADD-11).
// Single source of truth for AddState, AddGroupOutcome, AddJobFile, AddErrorCode, and AddRunStep.

/**
 * Per-group add failure codes.
 *
 * ADD_NOT_MUTUAL_CONTACT — defined for shape-completeness only. D-07 routes the
 *   USER_NOT_MUTUAL_CONTACT / USER_PRIVACY_RESTRICTED RPC strings to status 'privacy-blocked',
 *   never to this code — the classifier never assigns it (14-RESEARCH.md Pitfall 4).
 * PEER_FLOOD is a run-level hard-stop, not a per-group code — intentionally omitted here.
 */
export type AddErrorCode =
  | 'ADD_NO_RIGHTS'
  | 'ADD_NOT_MUTUAL_CONTACT'
  | 'ADD_USER_CHANNELS_TOO_MUCH'
  | 'ADD_USER_KICKED'
  | 'ADD_TARGET_INVALID'
  | 'ADD_CHANNEL_FULL'
  | 'NETWORK'
  | 'UNKNOWN'

/**
 * Step union for AddState.
 *
 * 'stopped'      — user aborted (resumable).
 * 'hard-stopped' — PEER_FLOOD (resumable).
 * 'confirming'   — dialog open, not yet dispatched.
 */
export type AddRunStep =
  | 'idle'
  | 'confirming'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'complete'
  | 'hard-stopped'

/**
 * Status of the single end-of-run direct message carrying generated invite links (D-13).
 * 'not-needed' — the run produced zero privacy-blocked links; no DM is sent.
 */
export type AddDmStatus = 'pending' | 'sent' | 'refused' | 'not-needed'

/**
 * Per-group outcome recorded during an add run.
 * Accumulated in AddState.outcomes as the run progresses and persisted in AddJobFile.
 *
 * D-19: exactly these five statuses.
 */
export interface AddGroupOutcome {
  /** Stable numeric chat/channel ID as a decimal string. */
  dialogId: string
  /** Outcome classification for this group. */
  status: 'done' | 'already-member' | 'privacy-blocked' | 'failed' | 'skipped'
  /** Typed failure code — present when status is 'failed'. */
  errorCode?: AddErrorCode
  /** Cause of the privacy block — present only when status is 'privacy-blocked' (D-07/D-12). */
  reason?: 'privacy' | 'channel-full'
  /** Exported single-use invite link — present only when status is 'privacy-blocked' (D-10). */
  link?: string
  /** Missing invitee flagged premium_would_allow_invite — D-09. */
  premiumWouldAllow?: boolean
  /** Result of the per-retry DM carrying the invite link (D-12). */
  retryDmStatus?: 'sent' | 'refused'
  /** ISO timestamp of when this outcome was recorded. */
  timestamp: string
}

/**
 * Summary counts produced when an add run finishes (complete, stopped, or hard-stopped).
 */
export interface AddSummary {
  added: number
  alreadyMember: number
  privacyBlocked: number
  failed: number
  skipped: number
  /** ISO timestamp of when the run reached its terminal state. */
  completedAt: string
}

/**
 * Live add state — streamed from main to renderer via ADD_STATE push channel.
 *
 * Security boundary (T-14-01): targetAccessHash is intentionally omitted here — it lives in
 * AddJobFile on disk (mode 0o600) and in main process memory only. The renderer receives
 * targetId/targetName for display purposes but never the accessHash.
 */
export interface AddState {
  step: AddRunStep
  /** Telegram user ID of the add target as a decimal string. */
  targetId: string
  /** Display name of the add target. */
  targetName: string
  /** Processed / total group count for the progress indicator. */
  progress: { processed: number; total: number }
  /** Accumulated per-group outcomes as the run progresses. */
  outcomes: AddGroupOutcome[]
  /** Present only when step is 'complete', 'stopped', or 'hard-stopped'. */
  summary?: AddSummary
  /** The group currently being processed (undefined between groups). */
  currentGroupId?: string
  /**
   * Seconds remaining in an active FLOOD_WAIT during an add run. Null when no flood wait is
   * active. Only meaningful when step === 'running'. Scoped to add-only flood events — NOT
   * from the shared OP_GOVERNOR_EVENT channel.
   */
  floodWaitRemaining?: number | null
  /**
   * Status of the single end-of-run DM carrying invite links (D-13/D-16).
   * Divergence flag: no RemovalState/TagState precedent carries a DM status field — net-new
   * for Add mode because of the link-fallback + single-DM-at-completion design.
   */
  dmStatus?: AddDmStatus
  /**
   * Dialog ids of the run's job (non-secret group ids only). Set by main so the renderer
   * only renders run status for rows that belong to the job (D-16). Never carries identity.
   */
  dialogIds?: string[]
}

/**
 * Job file schema persisted to userData/add-job.json after each group outcome.
 *
 * schemaVersion enables future migration without silent data loss.
 * targetAccessHash stored for resume: on restart the resolver may not be live (user jumped
 * straight to the resume prompt), so the executor reconstructs InputPeerUser from this value.
 * Acceptable risk — the job file is written with mode 0o600 (same as the session file),
 * and accessHash is not a session credential.
 *
 * Divergence from RemovalJobFile/TagJobFile (critical — see 14-RESEARCH.md Pattern 1): unlike
 * those job files, this job's `jobId` and `outcomes` MUST persist across a stop-resume cycle
 * (continuation-based resume, D-13/D-18) — AddExecutor.execute() does NOT call initJob()
 * unconditionally on every call; it must branch on an existing job first.
 */
export interface AddJobFile {
  schemaVersion: 1
  /** ISO timestamp used as a unique nonce for this job — reused across a resume cycle. */
  jobId: string
  /** Telegram user ID of the add target as a decimal string. */
  targetId: string
  /** Display name of the add target. */
  targetName: string
  /** Access hash for the target — stored for resume (resolver may be null after restart).
   *  0o600 protection on disk; never sent to renderer. */
  targetAccessHash: string
  /** Full ordered list of dialog IDs to process (checklist order from enumeration). */
  dialogIds: string[]
  /** Outcomes checkpointed after each group completes. */
  outcomes: AddGroupOutcome[]
  /** Status of the single end-of-run DM carrying invite links (D-13). */
  dmStatus: AddDmStatus
  /** ISO timestamp when the job was started. */
  startedAt: string
  /** ISO timestamp when the job reached a terminal state (complete/stopped/hard-stopped). */
  completedAt?: string
  /** Current persistence status — 'running' means the job is incomplete and will prompt Resume/Discard. */
  status: 'running' | 'complete' | 'stopped' | 'hard-stopped'
  /** Main-only (D-10): dialogIds where the target was banned at scan time — drives unban-first across relaunch. */
  bannedDialogIds?: string[]
}

/**
 * Renderer-safe projection of AddJobFile with targetAccessHash stripped.
 *
 * Security boundary (T-14-01): targetAccessHash must NEVER cross the IPC boundary —
 * it lives in the job file (mode 0o600) and in main-process memory only.
 * This type is used as the return type of ADD_GET_JOB so TypeScript enforces the
 * boundary at the call sites in both addChannels.ts and any renderer store.
 */
export type AddJobFileSafe = Omit<AddJobFile, 'targetAccessHash' | 'bannedDialogIds'>

/**
 * One plain-text log block appended to add-log.txt at a run's terminal state (D-17/D-18).
 * No precedent exists for this shape — net-new for Phase 14.
 *
 * Only 'done' outcomes populate addedDialogs; only 'privacy-blocked' outcomes that carry a
 * link populate linkedDialogs. Failed and skipped dialogs are NOT included (D-18) — they
 * live in add-job.json and the Phase 15 report instead.
 *
 * isFollowUp distinguishes a resumed run's appended block (references the original jobId,
 * lists only what that segment added) from the first block of a run.
 */
export interface AddLogBlockEntry {
  /** References the AddJobFile.jobId this block was produced from. */
  jobId: string
  /** True when this block is a follow-up appended after a resume, not the run's first block. */
  isFollowUp: boolean
  /** Telegram user ID of the add target as a decimal string. */
  targetId: string
  /** Display name of the add target. */
  targetName: string
  /** Groups the target was actually added to in this segment. */
  addedDialogs: Array<{ dialogId: string; title?: string }>
  /** Groups that received a privacy-fallback invite link in this segment. */
  linkedDialogs: Array<{ dialogId: string; title?: string; link: string }>
  /** Status of the end-of-run DM — never 'pending' once a terminal-state block is written. */
  dmStatus: Exclude<AddDmStatus, 'pending'>
  /** ISO timestamp of when this block was written. */
  timestamp: string
}

/**
 * Pure-function shape for rendering the end-of-run DM text from the persisted template (D-15).
 * AddExecutor receives an instance of this via constructor options and never imports the
 * template store directly — decouples the executor from electron-store.
 */
export type DmTextProvider = (vars: { name: string; links: string }) => string

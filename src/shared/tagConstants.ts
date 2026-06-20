// Pure config module — no runtime logic. Imported by both main and renderer processes.

/** Maximum character length for a member tag (rank/custom-title field).
 * PROVISIONAL — the Telegram maximum was not live-measured.
 * Change this constant and rebuild to retune; all validation and UI counters read from here. */
export const TAG_MAX_LENGTH = 16

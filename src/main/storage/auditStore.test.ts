/**
 * Wave 0 RED stubs for AuditStore.ts (EXE-05 job durability).
 *
 * All tests are it.todo() — Nyquist compliance gate before implementation.
 * Vitest treats todo stubs as pending (not failing) and exits 0.
 *
 * Test map:
 *   - Atomic write: writeJob uses temp-file-then-rename pattern (crash safety)
 *   - Checkpoint: appends outcome to job file outcomes array after each group
 *   - readJob: returns null when no job file present
 *   - readJob: returns null when file contains invalid JSON (malformed)
 *   - readJob: validates schema with Zod before returning; rejects unknown shape
 *   - Incomplete job detection: readJob returns job with status=running
 *   - Resume: remaining dialogIds = full list minus completed outcomes dialogIds
 */

import { describe, it } from 'vitest'

// ---------------------------------------------------------------------------
// AuditStore — job persistence
// ---------------------------------------------------------------------------

describe('AuditStore', () => {
  it.todo('writeJob: atomic write (temp file renamed to final path)')
  it.todo('checkpoint: appends outcome to job file outcomes array')
  it.todo('readJob: returns null when no job file present')
  it.todo('readJob: returns null when file contains invalid JSON (malformed)')
  it.todo('readJob: validates schema with Zod before returning; rejects unknown shape')
  it.todo('incomplete job detection: readJob returns job with status=running')
  it.todo('resume: remaining dialogIds = full list minus completed outcomes dialogIds')
})

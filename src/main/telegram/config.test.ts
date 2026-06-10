/**
 * RED tests for config.ts (AUTH-03: api_id/api_hash present at build, absent from committed source).
 * These tests import the NOT-YET-EXISTING inject-validated exports by their exact intended paths.
 * Parts of this test will FAIL with "Cannot find module" or assertion failures until plans 03/04 implement them.
 *
 * Test map (01-RESEARCH §Validation Architecture):
 *   - AUTH-03: API_ID is a positive number and API_HASH is a non-empty string at build/test (inject via test env)
 *   - Guard: no api_hash literal in committed source (32-hex scan over src/)
 */

import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

// RED: This import will fail until we can inject env at test time.
// config.ts exists (plan 01 created it) but API_ID/API_HASH are undefined
// in test mode unless MRPROPER_API_ID/MRPROPER_API_HASH are injected.
// Plans 03/04 add the test env injection or a testable validateConfig() export.
import { API_ID, API_HASH } from './config'

describe('AUTH-03: api_id/api_hash present at build (config.ts)', () => {
  it('AUTH-03: API_ID is a positive integer (injected via MRPROPER_API_ID env)', () => {
    // This test relies on MRPROPER_API_ID being set in the test environment.
    // In CI, it is provided as a secret; locally, from the untracked .env file.
    // RED: will fail until env injection is wired — that is expected in Wave 0.
    expect(typeof API_ID).toBe('number')
    expect(Number.isFinite(API_ID)).toBe(true)
    expect(API_ID).toBeGreaterThan(0)
  })

  it('AUTH-03: API_HASH is a non-empty string (injected via MRPROPER_API_HASH env)', () => {
    // RED: will fail until env injection is wired — that is expected in Wave 0.
    expect(typeof API_HASH).toBe('string')
    expect(API_HASH.length).toBeGreaterThan(0)
  })
})

describe('AUTH-03: no api_hash literal in committed source (D-04 guard)', () => {
  it('git grep finds no 32-char hex api_hash literal in src/', () => {
    // This is the CI/grep guard from plan 01.
    // Searches for 32-hex strings that look like api_hash values.
    // The actual api_hash from .env is in memory only; this guard ensures
    // no one accidentally hardcoded it in tracked source.
    let grepOutput = ''
    try {
      const repoRoot = join(__dirname, '../../../..')
      // Pattern: 32 consecutive hex chars — matches a Telegram api_hash literal
      grepOutput = execSync(
        `git -C "${repoRoot}" grep -r --include="*.ts" --include="*.js" -E "['\"][0-9a-f]{32}['\"]" -- src/`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim()
    } catch {
      // git grep returns exit code 1 when nothing is found — that is the expected (passing) case
      grepOutput = ''
    }

    if (grepOutput.length > 0) {
      // Provide clear failure message identifying the offending files
      expect(grepOutput, `api_hash literal found in tracked source:\n${grepOutput}`).toBe('')
    }
    // Empty output = no 32-hex literals in src/ = PASS
    expect(grepOutput).toBe('')
  })
})

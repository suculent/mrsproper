/**
 * RED stubs for i18n initialization, namespace coverage, and Czech plural forms.
 * LOC-02 (init/namespaces) and LOC-03 (Czech plurals) — Wave 0 Nyquist compliance.
 *
 * This file imports from '@renderer/i18n' which does not exist yet.
 * The suite will fail with "Cannot find module" — intentionally RED.
 * All test cases are .todo() stubs pending GREEN implementation.
 */

import { describe, it, expect, beforeAll } from 'vitest'

// RED import — module does not exist yet; resolution triggers test failure
import i18n, { initI18n } from '@renderer/i18n'

describe('i18n initialization', () => {
  beforeAll(async () => {
    await initI18n('en')
  })

  it.todo('initializes without error — i18n.isInitialized is true')
  it.todo('all six namespaces load: auth, target, groups, wizard, removal, shell — both en and cs')
  it.todo('t() returns non-empty string for auth:errorCode.FLOOD_WAIT')
  it.todo('t() does not return the key passthrough for known key')

  // Sentinel: ensures the import above is exercised by a non-todo suite entry
  it('i18n module is importable (will fail RED until @renderer/i18n is created)', () => {
    expect(i18n).toBeDefined()
  })
})

describe('Czech plural forms (LOC-03)', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('cs')
  })

  it.todo('groupCount count=1 → _one form (contains "skupina")')
  it.todo('groupCount count=2 → _few form (contains "skupiny")')
  it.todo('groupCount count=5 → _other form (contains "skupin")')
  it.todo('Czech auth error for FLOOD_WAIT is non-empty and does not contain raw code')
})

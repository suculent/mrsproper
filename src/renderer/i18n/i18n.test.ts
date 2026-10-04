/**
 * GREEN tests for i18n initialization, namespace coverage, and Czech plural forms.
 * LOC-02 (init/namespaces) and LOC-03 (Czech plurals) — implemented per Phase 8
 * review WR-01 (formerly RED .todo() stubs).
 *
 * Uses the real i18n singleton with statically bundled resources — no mocks,
 * no DOM. Czech plural assertions are EXACT strings so the _one/_few/_other
 * suffix selection is verified (substring checks would pass on the wrong form:
 * "skupina" contains "skupin").
 */

import { describe, it, expect, beforeAll } from 'vitest'

import i18n, { initI18n, resources } from '@renderer/i18n'

const NAMESPACES = ['auth', 'target', 'groups', 'wizard', 'removal', 'shell', 'tag', 'add'] as const

describe('i18n initialization', () => {
  beforeAll(async () => {
    await initI18n('en')
  })

  it('initializes without error — i18n.isInitialized is true', () => {
    expect(i18n.isInitialized).toBe(true)
    expect(i18n.language).toBe('en')
  })

  it('all namespaces load: auth, target, groups, wizard, removal, shell, tag, add — both en and cs', () => {
    for (const ns of NAMESPACES) {
      expect(i18n.hasResourceBundle('en', ns), `en/${ns} missing`).toBe(true)
      expect(i18n.hasResourceBundle('cs', ns), `cs/${ns} missing`).toBe(true)
      // Bundles must be non-empty objects (a truthy-but-empty bundle would
      // silently fall through to key passthrough at runtime).
      expect(Object.keys(resources.en[ns]).length).toBeGreaterThan(0)
      expect(Object.keys(resources.cs[ns]).length).toBeGreaterThan(0)
    }
  })

  it('t() returns non-empty string for auth:errorCode.FLOOD_WAIT', () => {
    const value = i18n.t('errorCode.FLOOD_WAIT', { ns: 'auth' })
    expect(typeof value).toBe('string')
    expect(value.length).toBeGreaterThan(0)
  })

  it('t() does not return the key passthrough for known keys', () => {
    expect(i18n.t('errorCode.FLOOD_WAIT', { ns: 'auth' })).not.toBe('errorCode.FLOOD_WAIT')
    expect(i18n.t('logOut', { ns: 'shell' })).not.toBe('logOut')
  })
})

describe('Czech plural forms (LOC-03)', () => {
  beforeAll(async () => {
    await initI18n('en')
    await i18n.changeLanguage('cs')
  })

  it('groupCount count=1 → _one form ("1 skupina")', () => {
    expect(i18n.t('groupCount', { ns: 'wizard', count: 1 })).toBe('1 skupina')
  })

  it('groupCount count=2 → _few form ("2 skupiny")', () => {
    expect(i18n.t('groupCount', { ns: 'wizard', count: 2 })).toBe('2 skupiny')
  })

  it('groupCount count=5 → _other form ("5 skupin")', () => {
    expect(i18n.t('groupCount', { ns: 'wizard', count: 5 })).toBe('5 skupin')
  })

  it('Czech auth error for FLOOD_WAIT is non-empty and does not contain raw code', () => {
    const value = i18n.t('errorCode.FLOOD_WAIT', { ns: 'auth' })
    expect(value.length).toBeGreaterThan(0)
    expect(value).not.toContain('FLOOD_WAIT')
  })
})

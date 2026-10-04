/**
 * Tests for the shared, pure DM template helpers (D-13, D-15, ADD-16).
 *
 * Mirrors the renderTemplate/defaults assertions that previously lived in
 * src/main/ipc/templateChannels.test.ts — those original tests are kept in place
 * (unmodified) since templateChannels.ts now re-exports these same symbols.
 */

import { describe, it, expect } from 'vitest'
import { renderTemplate, DEFAULT_TEMPLATE_EN, DEFAULT_TEMPLATE_CS, DM_TEMPLATE_MAX_LENGTH } from './dmTemplate'

describe('renderTemplate', () => {
  it('replaces {name} with the provided name', () => {
    expect(renderTemplate('Hi {name}!', { name: 'Jan Novák', links: '' })).toBe('Hi Jan Novák!')
  })

  it('replaces {links} with the provided links string (already newline-joined by the caller)', () => {
    const links = 'https://t.me/+a\nhttps://t.me/+b'
    expect(renderTemplate('Links:\n{links}', { name: '', links })).toBe(`Links:\n${links}`)
  })

  it('replaces multiple occurrences of the same placeholder', () => {
    expect(renderTemplate('{name} said hi, {name}!', { name: 'Petr', links: '' })).toBe(
      'Petr said hi, Petr!'
    )
  })

  it('WR-03: a target display name containing the literal substring "{links}" is not re-substituted by the second placeholder', () => {
    const result = renderTemplate('Hi {name}!\n{links}', { name: 'Evil{links}Name', links: 'https://t.me/+real' })
    expect(result).toBe('Hi Evil{links}Name!\nhttps://t.me/+real')
  })

  it('does not touch i18next-style {{ }} double-brace syntax if present in a template', () => {
    const template = 'Hi {name}! {{notAPlaceholder}}'
    expect(renderTemplate(template, { name: 'Jan', links: '' })).toBe(
      'Hi Jan! {{notAPlaceholder}}'
    )
  })

  it('DEFAULT_TEMPLATE_EN contains both {name} and {links} placeholders', () => {
    expect(DEFAULT_TEMPLATE_EN).toContain('{name}')
    expect(DEFAULT_TEMPLATE_EN).toContain('{links}')
  })

  it('DEFAULT_TEMPLATE_CS contains both {name} and {links} placeholders', () => {
    expect(DEFAULT_TEMPLATE_CS).toContain('{name}')
    expect(DEFAULT_TEMPLATE_CS).toContain('{links}')
  })
})

describe('DM_TEMPLATE_MAX_LENGTH', () => {
  it('equals 4000', () => {
    expect(DM_TEMPLATE_MAX_LENGTH).toBe(4000)
  })
})

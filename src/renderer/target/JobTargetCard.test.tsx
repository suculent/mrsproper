// JobTargetCard static-render coverage (17-04 D-01). Raw i18n keys (no i18n init).
import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { JobTargetCard } from './JobTargetCard'

const render = (id: string, name: string): string =>
  renderToStaticMarkup(<JobTargetCard targetId={id} targetName={name} />)

describe('JobTargetCard', () => {
  it('renders name, initials, keys and no image', () => {
    const html = render('123456789', 'Jane Doe')
    expect(html).toContain('Jane Doe')
    expect(html).toContain('JD')
    expect(html).toContain('jobCard.aria')
    expect(html).toContain('jobCard.kicker')
    expect(html).toContain('jobCard.note')
    expect(html).toContain('idLine')
    expect(html).not.toContain('<img')
  })
  it('renders the User icon for an empty name', () => {
    const html = render('123456789', '  ')
    expect(html).toContain('lucide-user')
  })
  it('does not throw for an empty targetId', () => {
    expect(() => render('', 'Jane')).not.toThrow()
  })
})

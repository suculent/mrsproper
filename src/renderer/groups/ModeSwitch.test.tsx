// Gap-closure coverage for ModeSwitch (15-09 Task 1, ADD-01).
// Rendered via react-dom/server (environment: 'node' — no jsdom); no i18next instance is
// initialized, so useTranslation returns the raw key string (e.g. "modeSwitch.remove") —
// assertions check for those raw key strings, not translated copy.
// Pattern: src/renderer/groups/GroupRow.test.tsx (class-token / attribute-aware helpers).
//
// Covers the component contract the plan only verified via `npx tsc --build`:
//   - a role="radiogroup" containing exactly three role="radio" buttons
//   - aria-checked="true" only on the button matching the `mode` prop
//   - disabled=true puts a real HTML `disabled` attribute + the tooltip title on all three
//     buttons; disabled=false puts it on none

import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ModeSwitch } from './ModeSwitch'
import type { GroupMode } from './modeRules'

function render(mode: GroupMode, disabled: boolean): string {
  return renderToStaticMarkup(<ModeSwitch mode={mode} onChange={() => {}} disabled={disabled} />)
}

interface ParsedButton {
  openTag: string
  inner: string
}

// Splits the markup into its <button ...>...</button> elements. ModeSwitch's buttons
// never nest, so a non-greedy match per element is exact.
function getButtons(html: string): ParsedButton[] {
  const out: ParsedButton[] = []
  for (const m of html.matchAll(/(<button\b[^>]*>)([\s\S]*?)<\/button>/g)) {
    out.push({ openTag: m[1], inner: m[2] })
  }
  return out
}

// Matches only a real HTML `disabled` attribute inside an opening tag — distinct from the
// static Tailwind variant tokens "disabled:pointer-events-none"/"disabled:opacity-50" the
// Button component always carries in its class attribute.
function hasDisabledAttribute(openTag: string): boolean {
  return /\sdisabled(=|\s|>)/.test(openTag)
}

function getAttr(openTag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(openTag)
  return m ? m[1] : null
}

const ALL_MODES: GroupMode[] = ['remove', 'tag', 'add']

describe('ModeSwitch — radiogroup structure (ADD-01)', () => {
  it('renders one role="radiogroup" wrapper containing exactly three role="radio" buttons', () => {
    const html = render('remove', false)

    expect(html.match(/role="radiogroup"/g) ?? []).toHaveLength(1)
    expect(html).toContain('aria-label="modeSwitchAria"')

    const buttons = getButtons(html)
    expect(buttons).toHaveLength(3)
    for (const b of buttons) {
      expect(getAttr(b.openTag, 'role')).toBe('radio')
    }
    // One button per mode, in Remove / Tag / Add order.
    expect(buttons.map((b) => b.inner)).toEqual([
      'modeSwitch.remove',
      'modeSwitch.tag',
      'modeSwitch.add',
    ])
  })
})

describe('ModeSwitch — aria-checked follows the mode prop (ADD-01)', () => {
  for (const mode of ALL_MODES) {
    it(`mode='${mode}': aria-checked="true" only on the ${mode} button, "false" on the other two`, () => {
      const html = render(mode, false)
      const buttons = getButtons(html)
      expect(buttons).toHaveLength(3)

      const checked = buttons.filter((b) => getAttr(b.openTag, 'aria-checked') === 'true')
      expect(checked).toHaveLength(1)
      expect(checked[0].inner).toBe(`modeSwitch.${mode}`)

      const unchecked = buttons.filter((b) => getAttr(b.openTag, 'aria-checked') === 'false')
      expect(unchecked).toHaveLength(2)
      expect(unchecked.map((b) => b.inner)).not.toContain(`modeSwitch.${mode}`)
    })
  }
})

describe('ModeSwitch — disabled prop (ADD-01)', () => {
  it('disabled=true: all three buttons carry a real HTML disabled attribute and the tooltip title', () => {
    const html = render('tag', true)
    const buttons = getButtons(html)
    expect(buttons).toHaveLength(3)

    for (const b of buttons) {
      expect(hasDisabledAttribute(b.openTag)).toBe(true)
      expect(getAttr(b.openTag, 'title')).toBe('modeSwitchDisabledTooltip')
    }
    // Disabling must not disturb the selection indicator.
    expect(buttons.filter((b) => getAttr(b.openTag, 'aria-checked') === 'true')).toHaveLength(1)
  })

  it('disabled=false: no button carries a disabled attribute or the tooltip title', () => {
    const html = render('tag', false)
    const buttons = getButtons(html)
    expect(buttons).toHaveLength(3)

    for (const b of buttons) {
      expect(hasDisabledAttribute(b.openTag)).toBe(false)
      expect(getAttr(b.openTag, 'title')).toBeNull()
    }
    expect(html).not.toContain('modeSwitchDisabledTooltip')
  })
})

describe('ModeSwitch — lockedByAddJob tooltip (17 D-02)', () => {
  it('uses the add-job tooltip when locked by an add job', () => {
    const html = renderToStaticMarkup(
      <ModeSwitch mode="add" onChange={() => {}} disabled lockedByAddJob />
    )
    const buttons = getButtons(html)
    for (const b of buttons) {
      expect(hasDisabledAttribute(b.openTag)).toBe(true)
      expect(getAttr(b.openTag, 'title')).toBe('modeSwitchLockedAddJobTooltip')
    }
  })
  it('keeps the generic tooltip when disabled without the flag, none when enabled', () => {
    const d = getButtons(render('add', true))
    expect(getAttr(d[0].openTag, 'title')).toBe('modeSwitchDisabledTooltip')
    const e = getButtons(
      renderToStaticMarkup(<ModeSwitch mode="add" onChange={() => {}} disabled={false} lockedByAddJob />)
    )
    expect(getAttr(e[0].openTag, 'title')).toBeNull()
  })
})

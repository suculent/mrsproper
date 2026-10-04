// Regression + gap-closure coverage for GroupRow's mode-aware grey rendering (15-14).
// Rendered via react-dom/server (environment: 'node' — no jsdom); no i18next instance is
// initialized, so useTranslation returns the raw key string (e.g. "greyReason.no-ban-right") —
// assertions check for those raw key strings, not translated copy.
//
// Closes both diagnosed UAT gaps:
//   - add-mode-acts-on-unchecked-group.md: an actionable, checked Add-mode row rendered
//     visually dimmed (opacity-50) with the Remove-mode caption/badge, so the user could not
//     tell it was selected.
//   - add-mode-shows-remove-grey-reason.md: a non-actionable Add-mode row always showed the
//     Remove-mode greyReason instead of the Add-specific addGreyReason, because the Add caption
//     required dialog.greyReason == null, which is never true for broadcast channels.
//
// Case 4 is a regression guard proving Remove-mode rendering (opacity-50, greyReason caption,
// type badge) is byte-identical to pre-fix behavior for the same dialog shape.

import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { GroupRow, type GroupRowProps } from './GroupRow'
import type { AdminDialogDTO } from '@shared/groupTypes'
import type { GroupMode } from './modeRules'

function render(
  dialog: AdminDialogDTO,
  membershipStatus: 'not-member' | 'member' | 'banned' | 'failed' | null,
  isChecked: boolean,
  activeMode: GroupMode
): string {
  return renderToStaticMarkup(
    <GroupRow
      dialog={dialog}
      membershipStatus={membershipStatus}
      isChecked={isChecked}
      onToggle={() => {}}
      onRetry={() => {}}
      activeMode={activeMode}
    />
  )
}

// Extracts the outermost wrapper <div>'s class attribute. Needed because a plain
// `toContain('opacity-50')` on the full markup false-positives: the actionable-row
// Checkbox (@radix-ui/react-checkbox) always carries the static Tailwind utility class
// "disabled:opacity-50" in its own className, regardless of this row's greyed state.
function getWrapperClasses(html: string): string[] {
  const match = /^<div class="([^"]*)"/.exec(html)
  if (!match) throw new Error('wrapper <div class="..."> not found in markup')
  return match[1].split(/\s+/)
}

// All class="..." tokens across the whole markup, flattened. Used to assert the ACTUAL
// non-actionable fallback's literal 'cursor-not-allowed' class token is absent, distinct
// from the always-present Tailwind variant token 'disabled:cursor-not-allowed' on the live
// Checkbox (a different, unrelated token once split on whitespace).
function getAllClassTokens(html: string): string[] {
  const tokens: string[] = []
  for (const m of html.matchAll(/class="([^"]*)"/g)) {
    tokens.push(...m[1].split(/\s+/))
  }
  return tokens
}

// True only when a real HTML `disabled` attribute is present on some element — distinct
// from the static Tailwind variant class tokens "disabled:opacity-50"/"disabled:cursor-not-allowed"
// that the Checkbox component always carries regardless of whether it is actually disabled.
function hasDisabledAttribute(html: string): boolean {
  return /\sdisabled(=|\s|>)/.test(html)
}

describe('GroupRow — Add-mode mode-aware grey rendering (15-14)', () => {
  it('Case 1: actionable supergroup (canAct=false/canAdd=true/not-member) in Add mode renders fully visible, checked, interactive', () => {
    const dialog: AdminDialogDTO = {
      id: '1001',
      title: 'Bohemia-detske pobyty',
      avatar: null,
      memberCount: 120,
      type: 'supergroup',
      canAct: false,
      greyReason: 'no-ban-right',
      canAdd: true,
      addGreyReason: null,
    }

    const html = render(dialog, 'not-member', true, 'add')

    expect(getWrapperClasses(html)).not.toContain('opacity-50')
    expect(html).not.toContain('greyReason.no-ban-right')
    expect(html).not.toContain('groupTypeLabel.supergroup')
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('includeInAddAria')
    expect(hasDisabledAttribute(html)).toBe(false)
    expect(getAllClassTokens(html)).not.toContain('cursor-not-allowed')
  })

  it('Case 2: non-actionable channel (canAdd=false/addGreyReason=no-invite-right) in Add mode shows the Add reason, never the Remove reason', () => {
    const dialog: AdminDialogDTO = {
      id: '1002',
      title: 'WixBotTest',
      avatar: null,
      memberCount: 10,
      type: 'broadcast-channel',
      canAct: false,
      greyReason: 'broadcast-channel',
      canAdd: false,
      addGreyReason: 'no-invite-right',
    }

    const html = render(dialog, 'not-member', false, 'add')

    expect(html).toContain('greyReason.no-invite-right')
    expect(html).not.toContain('greyReason.broadcast-channel')
  })

  it('Case 3: member row in Add mode renders dimmed with a renderer-derived "already a member" reason', () => {
    const dialog: AdminDialogDTO = {
      id: '1003',
      title: 'Some Supergroup',
      avatar: null,
      memberCount: 50,
      type: 'supergroup',
      canAct: true,
      greyReason: null,
      canAdd: true,
      addGreyReason: null,
    }

    const html = render(dialog, 'member', false, 'add')

    expect(getWrapperClasses(html)).toContain('opacity-50')
    expect(html).toContain('greyReason.already-member')
    expect(html).not.toContain('greyReason.no-ban-right')
    // No other greyReason.* key should appear alongside the derived reason.
    const greyReasonMatches = html.match(/greyReason\.[a-zA-Z-]+/g) ?? []
    expect(new Set(greyReasonMatches)).toEqual(new Set(['greyReason.already-member']))
  })

  it('Case 4 (regression): same supergroup as Case 1 in Remove mode renders identically to pre-fix behavior', () => {
    const dialog: AdminDialogDTO = {
      id: '1001',
      title: 'Bohemia-detske pobyty',
      avatar: null,
      memberCount: 120,
      type: 'supergroup',
      canAct: false,
      greyReason: 'no-ban-right',
      canAdd: true,
      addGreyReason: null,
    }

    const html = render(dialog, 'not-member', false, 'remove')

    expect(getWrapperClasses(html)).toContain('opacity-50')
    expect(html).toContain('greyReason.no-ban-right')
    expect(html).toContain('groupTypeLabel.supergroup')
  })
})

// ---------------------------------------------------------------------------
// Gap-closure coverage for the Add-mode subline (15-08 Task 2, ADD-13 / D-18).
// Same static-render + raw-key approach as above. Covers what the plan only verified via
// `npx tsc --build`: the privacy-blocked Copy button, the premiumWouldAllow hint, the failed
// row's Add-specific retry link, and that a done row renders neither.
// ---------------------------------------------------------------------------

type AddRunProps = Pick<
  GroupRowProps,
  'addStatus' | 'addErrorCode' | 'addLink' | 'premiumWouldAllow' | 'onRetryAdd'
>

function renderAddRun(extra: AddRunProps): string {
  const dialog: AdminDialogDTO = {
    id: '2001',
    title: 'Add Run Group',
    avatar: null,
    memberCount: 42,
    type: 'supergroup',
    canAct: true,
    greyReason: null,
    canAdd: true,
    addGreyReason: null,
  }
  return renderToStaticMarkup(
    <GroupRow
      dialog={dialog}
      membershipStatus="not-member"
      isChecked={true}
      onToggle={() => {}}
      onRetry={() => {}}
      activeMode="add"
      {...extra}
    />
  )
}

// Returns the opening tags of every <button> in the markup.
function getButtonOpenTags(html: string): string[] {
  return [...html.matchAll(/<button\b[^>]*>/g)].map((m) => m[0])
}

describe('GroupRow — Add-mode run subline (15-08 / ADD-13 / D-18)', () => {
  it('privacy-blocked row: renders "Invite link created" with a Copy link button and no Premium hint', () => {
    const html = renderAddRun({
      addStatus: 'privacy-blocked',
      addLink: 'https://t.me/+abc',
      premiumWouldAllow: false,
    })

    expect(html).toContain('rowStatus.linkCreated')
    // The Copy control must be a real <button> whose accessible name is the copyLink key.
    expect(html).toMatch(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*rowStatus\.copyLink/)
    expect(html).not.toContain('rowStatus.premiumHint')
    // Nothing from the failed branch leaks in.
    expect(html).not.toContain('retryRowLabel')
    expect(html).not.toContain('retryAddAria')
  })

  it('privacy-blocked row with premiumWouldAllow=true: additionally renders the Premium hint', () => {
    const html = renderAddRun({
      addStatus: 'privacy-blocked',
      addLink: 'https://t.me/+abc',
      premiumWouldAllow: true,
    })

    expect(html).toContain('rowStatus.copyLink')
    expect(html).toContain('rowStatus.premiumHint')
  })

  it('failed row: renders the typed error key and the Add-specific retry link (not the scan/remove retry)', () => {
    const html = renderAddRun({
      addStatus: 'failed',
      addErrorCode: 'ADD_NO_RIGHTS',
      onRetryAdd: () => {},
    })

    expect(html).toContain('rowError.ADD_NO_RIGHTS')
    expect(html).toContain('retryRowLabel')
    // The retry control is a <button> carrying the Add-specific aria-label.
    const retryButtons = getButtonOpenTags(html).filter((tag) => tag.includes('aria-label="retryAddAria"'))
    expect(retryButtons).toHaveLength(1)
    // Must be the Add retry, not the scan-failed retry (groups namespace) or a Copy button.
    expect(html).not.toContain('retryScanAria')
    expect(html).not.toContain('retryScanLabel')
    expect(html).not.toContain('rowStatus.copyLink')
    expect(html).not.toContain('rowStatus.premiumHint')
  })

  it('done row: renders the done status with no Copy button and no retry link', () => {
    const html = renderAddRun({ addStatus: 'done' })

    expect(html).toContain('rowStatus.done')
    expect(html).not.toContain('rowStatus.copyLink')
    expect(html).not.toContain('rowStatus.linkCreated')
    expect(html).not.toContain('rowStatus.premiumHint')
    expect(html).not.toContain('retryRowLabel')
    expect(html).not.toContain('retryAddAria')
    // A finished row has no interactive controls at all.
    expect(getButtonOpenTags(html)).toHaveLength(0)
  })
})

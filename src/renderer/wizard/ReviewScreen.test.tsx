// Gap-closure coverage for ReviewScreen's D-16 guard (15-10 Task 2, ADD-12):
// a deleted or bot target disables the Add confirm button and renders an inline explanation.
// Rendered via react-dom/server (environment: 'node' — no jsdom); importing @renderer/i18n does
// NOT call initI18n(), so useTranslation returns raw key strings — assertions use those keys.
// useEffect never runs under renderToStaticMarkup, so templateClient is never actually called;
// it is still mocked (with the other IPC clients ReviewScreen reaches transitively) so the
// import graph is window-free under node.
// Pattern: src/renderer/groups/GroupRow.test.tsx (static render + attribute-aware helpers).
//
// Store seeding: the stores are module singletons with no test seams, so the real actions are
// driven against mocked IPC clients (same vi.mock shapes as groupsStore.test.ts /
// targetStore.test.ts). getServerSnapshot returns the live module state, so seeded state is what
// the component renders.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AdminDialogDTO, GroupsState, ScanState } from '@shared/groupTypes'
import type { ResolvedTargetDTO, TargetState } from '@shared/targetTypes'

vi.mock('@renderer/ipc/targetClient', () => ({
  targetClient: {
    resolveTarget: vi.fn(),
    confirmTarget: vi.fn(),
    resetTarget: vi.fn(),
    getTargetState: vi.fn(() => new Promise(() => {})),
    onTargetState: vi.fn(() => vi.fn()),
    onGovernorEvent: vi.fn(() => vi.fn()),
    addTargetToContacts: vi.fn(),
  },
}))

vi.mock('@renderer/ipc/groupsClient', () => ({
  groupsClient: {
    getGroupsState: vi.fn(() => new Promise(() => {})),
    onGroupsState: vi.fn(() => vi.fn()),
    startScan: vi.fn(),
    abortScan: vi.fn(),
    retryScanGroup: vi.fn(),
    refreshGroups: vi.fn(),
    onScanState: vi.fn(() => vi.fn()),
  },
}))

vi.mock('@renderer/ipc/templateClient', () => ({
  templateClient: {
    getDmTemplate: vi.fn(() => Promise.resolve(null)),
    setDmTemplate: vi.fn((t: string) => Promise.resolve(t)),
  },
}))

vi.mock('@renderer/ipc/addClient', () => ({
  addClient: {
    startAdd: vi.fn(),
    abortAdd: vi.fn(),
    retryAddGroup: vi.fn(),
    getAddState: vi.fn(() => new Promise(() => {})),
    onAddState: vi.fn(() => vi.fn()),
    getAddJob: vi.fn(() => Promise.resolve(null)),
    discardAddJob: vi.fn(),
    exportAddLog: vi.fn(),
  },
}))

import { targetClient } from '@renderer/ipc/targetClient'
import { groupsClient } from '@renderer/ipc/groupsClient'
import { templateClient } from '@renderer/ipc/templateClient'
import { targetActions } from '@renderer/store/targetStore'
import { groupsActions } from '@renderer/store/groupsStore'
import { ReviewScreen } from './ReviewScreen'

// ---------------------------------------------------------------------------
// Fixtures + seeding
// ---------------------------------------------------------------------------

const ADDABLE_DIALOG: AdminDialogDTO = {
  id: '5001',
  title: 'Addable Supergroup',
  avatar: null,
  memberCount: 77,
  type: 'supergroup',
  canAct: true,
  greyReason: null,
  canAdd: true,
  addGreyReason: null,
}

function makeTarget(overrides: Partial<ResolvedTargetDTO> = {}): ResolvedTargetDTO {
  return {
    id: '123456789',
    name: 'Jane Doe',
    username: 'janedoe',
    bio: null,
    avatar: null,
    deleted: false,
    bot: false,
    premium: false,
    lastSeen: null,
    ...overrides,
  }
}

async function seedConfirmedTarget(overrides: Partial<ResolvedTargetDTO> = {}): Promise<void> {
  const state: TargetState = { step: 'confirmed', target: makeTarget(overrides) }
  vi.mocked(targetClient.confirmTarget).mockResolvedValue(state)
  await targetActions.confirmTarget()
}

// Loads one canAdd=true dialog, marks it not-member in a completed scan, and checks it via the
// mode-switch rebuild (the production path).
async function seedAddableCheckedGroup(): Promise<void> {
  const groups: GroupsState = { step: 'loaded', dialogs: [ADDABLE_DIALOG] }
  vi.mocked(groupsClient.refreshGroups).mockResolvedValue(groups)
  await groupsActions.refreshGroups()

  const scan: ScanState = {
    step: 'complete',
    results: [{ dialogId: ADDABLE_DIALOG.id, status: 'not-member' }],
  }
  vi.mocked(groupsClient.startScan).mockResolvedValue(scan)
  await groupsActions.startScan()

  // Same call ModeSwitch makes on selecting Add: rebuilds checkedDialogIds with the Add rule
  // (canAdd && not-member/banned), so the addable dialog is deterministically checked.
  groupsActions.recomputeCheckedForMode('add')
}

function render(): string {
  return renderToStaticMarkup(<ReviewScreen mode="add" onConfirm={() => {}} onBack={() => {}} />)
}

// ---------------------------------------------------------------------------
// Markup helpers
// ---------------------------------------------------------------------------

// The Add confirm button is the only <button> carrying aria-label="confirmAriaLabel" (raw key).
// The Back button (label editSelection) is a separate Button, so a global disabled check would
// be ambiguous — locate the confirm button precisely.
function getConfirmButtonTag(html: string): string {
  const tags = [...html.matchAll(/<button\b[^>]*>/g)].map((m) => m[0])
  const confirm = tags.filter((t) => t.includes('aria-label="confirmAriaLabel"'))
  if (confirm.length !== 1) {
    throw new Error(`expected exactly one confirm button, found ${confirm.length} in: ${tags.join('\n')}`)
  }
  return confirm[0]
}

// Real HTML `disabled` attribute only — distinct from the static Tailwind variant tokens
// "disabled:pointer-events-none"/"disabled:opacity-50" the Button component always carries.
function hasDisabledAttribute(openTag: string): boolean {
  return /\sdisabled(=|\s|>)/.test(openTag)
}

const EXPLANATION_KEY = 'confirmDisabledInvalidTarget'

beforeEach(async () => {
  vi.clearAllMocks()
  vi.mocked(targetClient.resetTarget).mockResolvedValue({ step: 'idle' })
  await targetActions.resetTarget()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReviewScreen — Add mode D-16 guard (ADD-12)', () => {
  it('control: a normal (non-deleted, non-bot) target with one addable checked group has an ENABLED confirm button and no explanation', async () => {
    await seedAddableCheckedGroup()
    await seedConfirmedTarget()

    const html = render()

    // Seeding sanity — the screen is on the Add path with a non-zero actionable count,
    // so an enabled button here is a genuine positive (count===0 would also disable it).
    expect(html).toContain('reviewTitle')
    expect(html).toContain('Jane Doe')
    expect(html).toContain('totalsAdding')
    expect(html).not.toContain('totalsEmpty')
    expect(html).toContain(ADDABLE_DIALOG.title)

    const confirm = getConfirmButtonTag(html)
    expect(hasDisabledAttribute(confirm)).toBe(false)
    expect(html).not.toContain(EXPLANATION_KEY)
    // Effects never run under static render — the template bridge must not have been hit.
    expect(templateClient.getDmTemplate).not.toHaveBeenCalled()
  })

  it('deleted target: confirm button is DISABLED and the explanation renders', async () => {
    await seedAddableCheckedGroup()
    await seedConfirmedTarget({ deleted: true })

    const html = render()

    expect(html).toContain('totalsAdding') // still 1 actionable group — disabling is the D-16 guard, not an empty list
    const confirm = getConfirmButtonTag(html)
    expect(hasDisabledAttribute(confirm)).toBe(true)
    expect(html).toContain(EXPLANATION_KEY)
  })

  it('bot target: confirm button is DISABLED and the explanation renders', async () => {
    await seedAddableCheckedGroup()
    await seedConfirmedTarget({ bot: true })

    const html = render()

    expect(html).toContain('totalsAdding')
    const confirm = getConfirmButtonTag(html)
    expect(hasDisabledAttribute(confirm)).toBe(true)
    expect(html).toContain(EXPLANATION_KEY)
  })

  it('D-16 guard leaves the Back button alone: it stays enabled for a deleted target', async () => {
    await seedAddableCheckedGroup()
    await seedConfirmedTarget({ deleted: true })

    const html = render()

    const backTag = [...html.matchAll(/(<button\b[^>]*>)([\s\S]*?)<\/button>/g)]
      .filter((m) => m[2].includes('editSelection'))
      .map((m) => m[1])
    expect(backTag).toHaveLength(1)
    expect(hasDisabledAttribute(backTag[0])).toBe(false)
  })

  it('D-16 guard is Add-mode only: a deleted target in Remove mode renders no Add explanation', async () => {
    await seedAddableCheckedGroup()
    await seedConfirmedTarget({ deleted: true })

    const html = renderToStaticMarkup(
      <ReviewScreen mode="remove" severity="ban" onConfirm={() => {}} onBack={() => {}} />
    )

    expect(html).not.toContain(EXPLANATION_KEY)
    expect(html).toContain('confirmAriaLabelBan')
  })
})

// Relaunch-resume job view coverage (17-05, D-01/D-03/D-04). Static render with mocked stores
// (environment: 'node', no jsdom). Effects do not run under renderToStaticMarkup; the scan-effect
// contract is covered through getPaneView in addPaneState.test.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}${JSON.stringify(params)}` : key,
  }),
}))

const mocks = vi.hoisted(() => ({
  add: {} as Record<string, unknown>,
  target: { step: 'idle' } as Record<string, unknown>,
  abortScan: vi.fn(),
  startScan: vi.fn(),
}))

vi.mock('../store/groupsStore', () => ({
  useGroupsStore: () => ({
    groups: {
      step: 'loaded',
      dialogs: [
        { id: '1', title: 'Alpha', memberCount: 5, canAdd: true },
        { id: '2', title: 'Beta', memberCount: 9, canAdd: true },
        { id: '3', title: 'Gamma', memberCount: 1, canAdd: true },
      ],
    },
    scan: { step: 'idle' },
    checkedDialogIds: new Set<string>(),
  }),
  groupsActions: {
    abortScan: mocks.abortScan,
    startScan: mocks.startScan,
    toggleGroup: vi.fn(),
    refreshGroups: vi.fn(),
    retryScanGroup: vi.fn(),
  },
}))
vi.mock('../store/targetStore', () => ({
  useTargetStore: () => ({ target: mocks.target }),
  targetActions: { resetTarget: vi.fn() },
}))
vi.mock('../store/removalStore', () => ({
  useRemovalStore: () => ({
    state: { step: 'idle', outcomes: [], progress: { processed: 0, total: 0 } },
  }),
  removalActions: { abortRemoval: vi.fn(), resumeJobFromDisk: vi.fn(), retryGroup: vi.fn() },
}))
vi.mock('../store/tagStore', () => ({
  useTagStore: () => ({
    state: { step: 'idle', outcomes: [], progress: { processed: 0, total: 0 } },
  }),
  tagActions: { abortTag: vi.fn(), resumeJobFromDisk: vi.fn() },
}))
vi.mock('../store/addStore', () => ({
  useAddStore: () => ({ state: mocks.add, pendingJob: null }),
  addActions: { abortAdd: vi.fn(), resumeJobFromDisk: vi.fn(), retryGroup: vi.fn() },
}))
vi.mock('../ipc/addClient', () => ({ addClient: { exportAddLog: vi.fn() } }))

import { GroupsPane } from './GroupsPane'

function setAdd(step: string, extra: Record<string, unknown> = {}): void {
  mocks.add = {
    step,
    targetId: '99',
    targetName: 'Mallory',
    dialogIds: ['3', '1'],
    progress: { processed: 0, total: 2 },
    outcomes: [],
    ...extra,
  }
}

function render(): string {
  return renderToStaticMarkup(
    <GroupsPane onNavigateToReview={() => {}} onNavigateToTarget={() => {}} stage="groups" />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.target = { step: 'idle' }
})

describe('GroupsPane job view (relaunch resume)', () => {
  it('running job with no confirmed target shows stop + progress using add.targetName', () => {
    setAdd('running')
    const html = render()
    expect(html).toContain('stopLabel')
    expect(html).toContain('progressLabel')
    expect(html).toContain('Mallory')
  })

  it('lists only job rows in job order and no selection checkbox', () => {
    setAdd('running')
    const html = render()
    expect(html).toContain('Gamma')
    expect(html).toContain('Alpha')
    expect(html).not.toContain('Beta')
    expect(html.indexOf('Gamma')).toBeLessThan(html.indexOf('Alpha'))
    expect(html).not.toContain('includeInAddAria')
    expect(html).not.toContain('includeInRemovalAria')
  })

  it('hard-stopped renders the PEER_FLOOD band', () => {
    setAdd('hard-stopped')
    expect(render()).toContain('peerFloodBanner')
  })

  it('stopped and complete render the summary bands', () => {
    setAdd('stopped')
    expect(render()).toContain('summaryStopped')
    setAdd('complete', { summary: { added: 1, alreadyMember: 0, privacyBlocked: 0, failed: 0, skipped: 0 } })
    const html = render()
    expect(html).toContain('summaryPart.added')
    expect(html).toContain('addSomeoneElse')
  })

  it('does not start or abort a scan while rendering the job view', () => {
    setAdd('running')
    render()
    expect(mocks.abortScan).not.toHaveBeenCalled()
    expect(mocks.startScan).not.toHaveBeenCalled()
  })
})

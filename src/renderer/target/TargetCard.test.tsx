// Gap-closure coverage for TargetCard's Add-to-contacts block (15-11 Task 1, ADD-05 / D-08, D-10).
// Rendered via react-dom/server (environment: 'node' — no jsdom); importing @renderer/i18n does
// NOT call initI18n(), so useTranslation returns the raw key string (e.g. "contactsCheckboxLabel")
// — assertions check for those raw keys, not translated copy.
// Pattern: src/renderer/groups/GroupRow.test.tsx (static render + attribute-aware helpers).
//
// Store seeding: targetStore has no test seam for `target`, so the real targetActions are driven
// against a mocked targetClient (same vi.mock shape as src/renderer/store/targetStore.test.ts).
// useSyncExternalStore's getServerSnapshot returns the live module state, so state seeded before
// renderToStaticMarkup is what the component renders. The store is a module singleton, so each
// test resets it through targetActions.resetTarget() in beforeEach.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
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

import { targetClient } from '@renderer/ipc/targetClient'
import { targetActions } from '@renderer/store/targetStore'
import { TargetCard } from './TargetCard'

type Mode = 'remove' | 'tag' | 'add' | undefined

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

async function seedTarget(state: TargetState): Promise<void> {
  if (state.step === 'confirmed') {
    vi.mocked(targetClient.confirmTarget).mockResolvedValue(state)
    await targetActions.confirmTarget()
  } else if (state.step === 'resolved') {
    vi.mocked(targetClient.resolveTarget).mockResolvedValue(state)
    await targetActions.resolveTarget('@janedoe')
  } else {
    throw new Error(`seedTarget: unsupported step ${state.step}`)
  }
}

function render(mode: Mode): string {
  return renderToStaticMarkup(mode === undefined ? <TargetCard /> : <TargetCard mode={mode} />)
}

// Opening tag of the Add-to-contacts checkbox (radix Checkbox renders a <button role="checkbox">
// carrying the id prop), or null when the block is not rendered.
function getContactsCheckboxTag(html: string): string | null {
  const m = /<button\b[^>]*\bid="add-to-contacts"[^>]*>/.exec(html)
  return m ? m[0] : null
}

beforeEach(async () => {
  vi.clearAllMocks()
  vi.mocked(targetClient.resetTarget).mockResolvedValue({ step: 'idle' })
  await targetActions.resetTarget()
})

describe('TargetCard — store seeding sanity', () => {
  it('renders nothing while the store is idle (so later assertions cannot pass on an empty card)', () => {
    expect(render('add')).toBe('')
  })
})

describe('TargetCard — Add-to-contacts checkbox is Add-mode only (ADD-05 / D-08)', () => {
  it("mode='add', confirmed target: renders the pre-checked checkbox with its label", async () => {
    await seedTarget({ step: 'confirmed', target: makeTarget() })

    const html = render('add')

    expect(html).toContain('targetConfirmed')
    expect(html).toContain('contactsCheckboxLabel')
    const checkbox = getContactsCheckboxTag(html)
    expect(checkbox).not.toBeNull()
    expect(checkbox).toContain('role="checkbox"')
    // D-08: pre-checked by default
    expect(checkbox).toContain('aria-checked="true"')
    expect(html).toContain('for="add-to-contacts"')
    // No failure notice before any contact-add attempt
    expect(html).not.toContain('contactsFailedNotice')
  })

  it("mode='add', resolved (not yet confirmed) target: checkbox is present alongside the confirm CTA", async () => {
    await seedTarget({ step: 'resolved', target: makeTarget() })

    const html = render('add')

    expect(html).toContain('isThisRightPerson')
    expect(html).toContain('confirmPerson')
    expect(html).toContain('contactsCheckboxLabel')
    expect(getContactsCheckboxTag(html)).not.toBeNull()
  })

  it("mode='add' after toggleAddToContacts(false): checkbox renders unchecked", async () => {
    await seedTarget({ step: 'confirmed', target: makeTarget() })
    targetActions.toggleAddToContacts(false)

    const checkbox = getContactsCheckboxTag(render('add'))
    expect(checkbox).not.toBeNull()
    expect(checkbox).toContain('aria-checked="false"')
  })

  for (const mode of ['remove', 'tag', undefined] as Mode[]) {
    it(`mode=${mode === undefined ? 'omitted' : `'${mode}'`}: the checkbox block is absent`, async () => {
      await seedTarget({ step: 'confirmed', target: makeTarget() })

      const html = render(mode)

      // The card itself rendered (same seeded target) ...
      expect(html).toContain('targetConfirmed')
      expect(html).toContain('Jane Doe')
      // ... but nothing from the Add-only block.
      expect(html).not.toContain('contactsCheckboxLabel')
      expect(getContactsCheckboxTag(html)).toBeNull()
      expect(html).not.toContain('contactsFailedNotice')
    })
  }
})

describe('TargetCard — failed contact add shows the quiet inline notice (ADD-05 / D-10)', () => {
  it("mode='add' with contactAddFailed=true in the store: renders contactsFailedNotice", async () => {
    await seedTarget({ step: 'confirmed', target: makeTarget() })
    vi.mocked(targetClient.addTargetToContacts).mockResolvedValue({ ok: false, code: 'UNKNOWN' })
    await targetActions.maybeAddToContacts()
    expect(targetClient.addTargetToContacts).toHaveBeenCalledTimes(1)

    const html = render('add')

    expect(html).toContain('contactsCheckboxLabel')
    expect(html).toContain('contactsFailedNotice')
    // Non-blocking: the card still renders the identity + Change target control.
    expect(html).toContain('changeTarget')
  })

  it("mode='add' with a successful contact add: no failure notice", async () => {
    await seedTarget({ step: 'confirmed', target: makeTarget() })
    vi.mocked(targetClient.addTargetToContacts).mockResolvedValue({ ok: true })
    await targetActions.maybeAddToContacts()

    const html = render('add')

    expect(html).toContain('contactsCheckboxLabel')
    expect(html).not.toContain('contactsFailedNotice')
  })

  it("mode='remove' with contactAddFailed=true: notice stays hidden (block is Add-mode gated)", async () => {
    await seedTarget({ step: 'confirmed', target: makeTarget() })
    vi.mocked(targetClient.addTargetToContacts).mockResolvedValue({ ok: false })
    await targetActions.maybeAddToContacts()

    const html = render('remove')

    expect(html).toContain('targetConfirmed')
    expect(html).not.toContain('contactsFailedNotice')
  })
})

// Three-way Remove/Tag/Add segmented control (D-01).
// Markup is a direct copy of ReviewScreen.tsx's existing role="radio" button-row severity
// picker (lines 272-310) — no new toggle-group primitive needed (15-UI-SPEC.md Design System).
// D-03: every selection synchronously recomputes the checklist selection for the new mode
// BEFORE bubbling onChange to the parent, so the checked-set never goes stale against the
// new partition rule (15-RESEARCH.md Pitfall 3).

import React from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button'
import { groupsActions } from '../store/groupsStore'
import type { GroupMode } from './modeRules'

interface ModeSwitchProps {
  mode: GroupMode
  onChange: (mode: GroupMode) => void
  disabled: boolean
}

export function ModeSwitch({ mode, onChange, disabled }: ModeSwitchProps): React.JSX.Element {
  const { t: tG } = useTranslation('groups')

  function handleSelect(next: GroupMode): void {
    // D-03: recompute the checklist selection for the new mode before notifying the parent.
    groupsActions.recomputeCheckedForMode(next)
    onChange(next)
  }

  const disabledProps = disabled
    ? { disabled: true, title: tG('modeSwitchDisabledTooltip') }
    : {}

  return (
    <div
      role="radiogroup"
      aria-label={tG('modeSwitchAria')}
      className="flex rounded-md border border-border overflow-hidden"
    >
      <Button
        role="radio"
        aria-checked={mode === 'remove'}
        variant={mode === 'remove' ? 'default' : 'ghost'}
        size="sm"
        className="rounded-none flex-1"
        onClick={() => handleSelect('remove')}
        {...disabledProps}
      >
        {tG('modeSwitch.remove')}
      </Button>
      <Button
        role="radio"
        aria-checked={mode === 'tag'}
        variant={mode === 'tag' ? 'default' : 'ghost'}
        size="sm"
        className="rounded-none flex-1 border-l border-border"
        onClick={() => handleSelect('tag')}
        {...disabledProps}
      >
        {tG('modeSwitch.tag')}
      </Button>
      <Button
        role="radio"
        aria-checked={mode === 'add'}
        variant={mode === 'add' ? 'default' : 'ghost'}
        size="sm"
        className="rounded-none flex-1 border-l border-border"
        onClick={() => handleSelect('add')}
        {...disabledProps}
      >
        {tG('modeSwitch.add')}
      </Button>
    </div>
  )
}

export default ModeSwitch

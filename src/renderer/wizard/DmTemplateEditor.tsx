// DmTemplateEditor — toggle-reveal DM template editor for the Add review screen (D-11/D-12).
// Controlled by ReviewScreen: `value` is the persisted/default template it owns; this
// component owns only its own local draft state while the editor is open.
// Pattern: TagInput.tsx's inline-validated input chrome (disabled-with-message on invalid input).

import React, { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui/button'
import { Textarea } from '@renderer/components/ui/textarea'
import { validateDmTemplate } from './addValidation'
import { DM_TEMPLATE_MAX_LENGTH } from '@shared/dmTemplate'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DmTemplateEditorProps {
  value: string
  onSave: (next: string) => void
  onReset: () => void
}

// ---------------------------------------------------------------------------
// DmTemplateEditor component
// ---------------------------------------------------------------------------

export function DmTemplateEditor({ value, onSave, onReset }: DmTemplateEditorProps): React.JSX.Element {
  const { t } = useTranslation('add')
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  // D-12: three failure modes, computed fresh on every render (derived, not stored).
  const error = validateDmTemplate(draft)

  const handleToggle = useCallback(() => {
    // Re-seed the draft from the current persisted/default value each time the editor opens.
    if (!isEditing) setDraft(value)
    setIsEditing((prev) => !prev)
  }, [isEditing, value])

  const handleSave = useCallback(() => {
    onSave(draft)
    setIsEditing(false)
  }, [draft, onSave])

  const handleReset = useCallback(() => {
    onReset()
    setDraft(value)
  }, [onReset, value])

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="ghost" size="sm" className="self-start" onClick={handleToggle}>
        {isEditing ? t('dmEditToggleClose') : t('dmEditToggleOpen')}
      </Button>

      {isEditing && (
        <div className="flex flex-col gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-invalid={error !== null}
            className={error ? 'border-destructive ring-destructive' : ''}
          />

          <div className="flex flex-col gap-0.5">
            <span className="text-label text-muted-foreground">{t('dmPlaceholderLegendName')}</span>
            <span className="text-label text-muted-foreground">{t('dmPlaceholderLegendLinks')}</span>
          </div>

          {error !== null && (
            <p role="alert" className="text-label text-destructive">
              {t(
                error === 'missingLinks'
                  ? 'dmValidationMissingLinks'
                  : error === 'empty'
                    ? 'dmValidationEmpty'
                    : 'dmValidationTooLong',
                { max: DM_TEMPLATE_MAX_LENGTH }
              )}
            </p>
          )}

          <div className="flex gap-2">
            <Button type="button" variant="default" size="sm" onClick={handleSave} disabled={error !== null}>
              {t('dmSaveLabel')}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleReset}>
              {t('dmResetLabel')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

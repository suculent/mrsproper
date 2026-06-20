// TagInput — controlled text input with live character counter and inline validation error.
// Used in ReviewScreen when action === 'tag'. Counter and error driven by validateTagInput result.
// Accessibility: role=alert on error paragraph, aria-live=polite on counter span.

import React from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@renderer/components/ui/input'
import { TAG_MAX_LENGTH } from '@shared/tagConstants'
import type { TagInputError } from './tagValidation'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TagInputProps {
  value: string
  onChange: (value: string) => void
  error: TagInputError
  disabled?: boolean
  inputRef?: React.RefObject<HTMLInputElement | null>
}

// ---------------------------------------------------------------------------
// TagInput component
// ---------------------------------------------------------------------------

export function TagInput({
  value,
  onChange,
  error,
  disabled,
  inputRef,
}: TagInputProps): React.JSX.Element {
  const { t } = useTranslation('tag')

  return (
    <div className="flex flex-col gap-2">
      {/* Section label — htmlFor wired to the input id below */}
      <label htmlFor="tag-input-field" className="text-label font-semibold">
        {t('tagInputLabel')}
      </label>

      {/* Controlled text input */}
      <Input
        id="tag-input-field"
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={TAG_MAX_LENGTH}
        placeholder={t('tagInputPlaceholder')}
        disabled={disabled}
        aria-invalid={error != null}
        className={error ? 'border-destructive ring-destructive' : ''}
      />

      {/* Counter + error row */}
      <div className="flex items-baseline justify-between">
        {/* Left slot — inline validation error or empty placeholder */}
        {error ? (
          <p role="alert" className="text-label text-destructive">
            {t(
              error === 'tooLong' ? 'tagErrorTooLong' : 'tagErrorControlChars',
              { max: TAG_MAX_LENGTH }
            )}
          </p>
        ) : (
          <span />
        )}

        {/* Right slot — character counter */}
        <span
          className="text-label text-muted-foreground"
          aria-live="polite"
        >
          {value.length} / {TAG_MAX_LENGTH}
        </span>
      </div>
    </div>
  )
}

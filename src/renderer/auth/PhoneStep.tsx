// Phone step — country picker + national number input, pre-send format validation, D-07/D-09/D-14.
// Pre-send validation uses libphonenumber-js (client-side).
// Server-side rejection (PHONE_NUMBER_INVALID) maps to auth.json errorCode keys via i18n.

import React, { useState, useCallback } from 'react'
import { isValidPhoneNumber } from 'libphonenumber-js/min'
import type { CountryCode } from 'libphonenumber-js/min'
import { Loader2, AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { Label } from '@renderer/components/ui/label'
import CountryPicker, { DEFAULT_COUNTRY, type CountryOption } from './CountryPicker'
import FloodCountdown from './FloodCountdown'
import type { AuthState } from '@shared/authTypes'
import { authActions } from '@renderer/store/authStore'
import { cn } from '@renderer/lib/utils'

interface PhoneStepProps {
  authState: AuthState
  floodRemaining: number
}

export default function PhoneStep({ authState, floodRemaining }: PhoneStepProps): React.JSX.Element {
  const { t } = useTranslation('auth')
  const [country, setCountry] = useState<CountryOption>(DEFAULT_COUNTRY)
  const [national, setNational] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isFlood = authState.step === 'floodWait' && authState.retryStep === 'phone'
  const isProcessing = authState.step === 'sendingCode' || isSubmitting

  // Show server-side error if the error retryStep is 'phone'
  const serverError =
    authState.step === 'error' && authState.retryStep === 'phone'
      ? t(`errorCode.${authState.code}`)
      : null
  const displayError = localError ?? serverError

  const handleNationalChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNational(e.target.value)
    if (localError) setLocalError(null)
  }, [localError])

  const handleCountryChange = useCallback((c: CountryOption) => {
    setCountry(c)
    if (localError) setLocalError(null)
    // Selecting a country never clears the typed number (D-07)
  }, [localError])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()

    // Pre-send libphonenumber-js validation (D-14)
    const fullNumber = `${country.dialCode}${national}`
    const valid = isValidPhoneNumber(fullNumber, country.code as CountryCode)
    if (!valid) {
      setLocalError(t('invalidPhoneFormat'))
      return
    }

    setLocalError(null)
    setIsSubmitting(true)
    try {
      await authActions.submitPhone(country.dialCode, national)
    } finally {
      setIsSubmitting(false)
    }
  }, [country, national])

  const disabled = isProcessing || isFlood
  const hasError = Boolean(displayError)

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {/* Title + hint */}
      <div className="space-y-2">
        <h1 className="text-display text-foreground">{t('phoneStep.title')}</h1>
        <p className="text-body text-muted-foreground">
          {t('phoneStep.description')}
        </p>
      </div>

      {/* Country picker + national number (8px gap = gap-2) */}
      <div className="space-y-2">
        <Label htmlFor="national-number" className="text-label">{t('phoneStep.phoneLabel')}</Label>
        <div className="flex items-center gap-2">
          <CountryPicker
            value={country}
            onChange={handleCountryChange}
            disabled={disabled}
          />
          <Input
            id="national-number"
            type="tel"
            placeholder={t('phoneStep.phonePlaceholder')}
            value={national}
            onChange={handleNationalChange}
            disabled={disabled}
            aria-invalid={hasError}
            aria-describedby={hasError ? 'phone-error' : undefined}
            className={cn(
              'flex-1',
              hasError && 'border-destructive focus-visible:ring-destructive'
            )}
            autoComplete="tel-national"
          />
        </div>

        {/* Inline error (D-12) */}
        {displayError && (
          <p
            id="phone-error"
            className="flex items-center gap-1 text-label text-destructive"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {displayError}
          </p>
        )}
      </div>

      {/* Submit button with inline spinner (D-09) */}
      <Button
        type="submit"
        className="w-full"
        disabled={disabled}
        aria-label={isFlood ? t('floodCountdownAria', { time: floodRemaining }) : t('phoneStep.sendCode')}
      >
        {isProcessing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            {t('phoneStep.sendCode')}
          </>
        ) : isFlood ? (
          <>
            {t('tryAgainIn')}{' '}
            <FloodCountdown remaining={floodRemaining} />
          </>
        ) : (
          t('phoneStep.sendCode')
        )}
      </Button>
    </form>
  )
}

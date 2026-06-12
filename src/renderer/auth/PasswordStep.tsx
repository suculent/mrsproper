// 2FA password step — conditional, only rendered when state.step === 'needPassword'.
// Wrong-password inline error, Back link, loading state (D-09).

import React, { useState, useCallback } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { Label } from '@renderer/components/ui/label'
import FloodCountdown from './FloodCountdown'
import type { AuthState } from '@shared/authTypes'
import { authActions } from '@renderer/store/authStore'
import { cn } from '@renderer/lib/utils'

interface PasswordStepProps {
  authState: AuthState
  floodRemaining: number
  onBack: () => void
}

export default function PasswordStep({ authState, floodRemaining, onBack }: PasswordStepProps): React.JSX.Element {
  const { t } = useTranslation('auth')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const hint =
    authState.step === 'needPassword' && authState.hint ? authState.hint : null

  const isFlood = authState.step === 'floodWait' && authState.retryStep === 'password'
  const isProcessing = authState.step === 'verifying' || isSubmitting

  // Error on password step
  const serverError =
    authState.step === 'error' && authState.retryStep === 'password'
      ? t(`errorCode.${authState.code}`)
      : null

  const handlePasswordChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value)
  }, [])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) return

    setIsSubmitting(true)
    try {
      await authActions.submitPassword(password)
    } finally {
      setIsSubmitting(false)
    }
  }, [password])

  const disabled = isProcessing || isFlood
  const hasError = Boolean(serverError)

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {/* Back link — top-left on 2FA step */}
      <div>
        <button
          type="button"
          onClick={onBack}
          className="text-label text-muted-foreground hover:text-foreground transition-colors"
          disabled={disabled}
        >
          {t('passwordStep.back')}
        </button>
      </div>

      {/* Title + hint */}
      <div className="space-y-2">
        <h1 className="text-display text-foreground">{t('passwordStep.title')}</h1>
        <p className="text-body text-muted-foreground">
          {t('passwordStep.description')}
        </p>
        {hint && (
          <p className="text-label text-muted-foreground">
            {t('passwordStep.passwordHint', { hint })}
          </p>
        )}
      </div>

      {/* Password input */}
      <div className="space-y-2">
        <Label htmlFor="2fa-password" className="text-label">{t('passwordStep.passwordLabel')}</Label>
        <Input
          id="2fa-password"
          type="password"
          placeholder={t('passwordStep.passwordPlaceholder')}
          value={password}
          onChange={handlePasswordChange}
          disabled={disabled}
          aria-invalid={hasError}
          aria-describedby={hasError ? 'password-error' : undefined}
          className={cn(
            hasError && 'border-destructive focus-visible:ring-destructive'
          )}
          autoComplete="current-password"
        />

        {/* Inline error (stays on password step, D-12 pattern) */}
        {serverError && (
          <p
            id="password-error"
            className="flex items-center gap-1 text-label text-destructive"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {serverError}
          </p>
        )}
      </div>

      {/* Submit button with inline spinner (D-09) */}
      <Button
        type="submit"
        className="w-full"
        disabled={disabled || !password}
        aria-label={isFlood ? t('floodCountdownAria', { time: floodRemaining }) : t('passwordStep.signIn')}
      >
        {isProcessing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            {t('passwordStep.signIn')}
          </>
        ) : isFlood ? (
          <>
            Try again in{' '}
            <FloodCountdown remaining={floodRemaining} />
          </>
        ) : (
          t('passwordStep.signIn')
        )}
      </Button>
    </form>
  )
}

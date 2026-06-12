// Code step — manual code entry with "sent to your Telegram app" hint (D-08).
// Inline error + Resend for expired code (D-12).
// User stays on the code step on error — no phone-step bounce.

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

interface CodeStepProps {
  authState: AuthState
  floodRemaining: number
  onBack: () => void
}

export default function CodeStep({ authState, floodRemaining, onBack }: CodeStepProps): React.JSX.Element {
  const { t } = useTranslation('auth')
  const [code, setCode] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResending, setIsResending] = useState(false)

  // Extract sentTo from needCode state
  const sentTo = authState.step === 'needCode' ? authState.sentTo : ''
  const canResend = authState.step === 'needCode' ? authState.canResend : true

  const isFlood = authState.step === 'floodWait' && authState.retryStep === 'code'
  const isProcessing = authState.step === 'verifying' || isSubmitting

  // Error on code step
  const serverError =
    authState.step === 'error' && authState.retryStep === 'code'
      ? t(`errorCode.${authState.code}`)
      : null
  const isExpired = authState.step === 'error' && authState.code === 'PHONE_CODE_EXPIRED'

  const handleCodeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setCode(e.target.value)
  }, [])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return

    setIsSubmitting(true)
    try {
      await authActions.submitCode(code.trim())
    } finally {
      setIsSubmitting(false)
    }
  }, [code])

  const handleResend = useCallback(async () => {
    setIsResending(true)
    try {
      await authActions.resendCode()
      setCode('')
    } finally {
      setIsResending(false)
    }
  }, [])

  const disabled = isProcessing || isFlood
  const hasError = Boolean(serverError)

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {/* Back link — top-left on code/2FA steps only */}
      <div>
        <button
          type="button"
          onClick={onBack}
          className="text-label text-muted-foreground hover:text-foreground transition-colors"
          disabled={disabled}
        >
          {t('codeStep.back')}
        </button>
      </div>

      {/* Title + hint */}
      <div className="space-y-2">
        <h1 className="text-display text-foreground">{t('codeStep.title')}</h1>
        <p className="text-body text-muted-foreground">
          {t('codeStep.description')}
        </p>
        {sentTo && (
          <p className="text-label text-muted-foreground">
            {t('codeStep.sentTo', { sentTo })}
          </p>
        )}
      </div>

      {/* Code input */}
      <div className="space-y-2">
        <Label htmlFor="login-code" className="text-label">{t('codeStep.codeLabel')}</Label>
        <Input
          id="login-code"
          type="text"
          placeholder={t('codeStep.codePlaceholder')}
          value={code}
          onChange={handleCodeChange}
          disabled={disabled}
          aria-invalid={hasError}
          aria-describedby={hasError ? 'code-error' : undefined}
          className={cn(
            'text-mono tracking-widest',
            hasError && 'border-destructive focus-visible:ring-destructive'
          )}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
        />

        {/* Inline error (D-12) — stays on code step */}
        {serverError && (
          <p
            id="code-error"
            className="flex items-center gap-1 text-label text-destructive"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {serverError}
          </p>
        )}

        {/* Resend link — emphasized when expired (D-12) */}
        {(canResend || isExpired) && !isFlood && (
          <button
            type="button"
            onClick={handleResend}
            disabled={isResending || isProcessing}
            className={cn(
              'text-label text-primary hover:underline transition-colors',
              isExpired && 'font-bold',
              (isResending || isProcessing) && 'opacity-50 cursor-not-allowed'
            )}
          >
            {isResending ? (
              <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                {t('codeStep.resending')}
              </span>
            ) : (
              t('codeStep.resendCode')
            )}
          </button>
        )}
      </div>

      {/* Submit button with inline spinner (D-09) */}
      <Button
        type="submit"
        className="w-full"
        disabled={disabled || !code.trim()}
        aria-label={isFlood ? t('floodCountdownAria', { time: floodRemaining }) : t('codeStep.verify')}
      >
        {isProcessing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            {t('codeStep.verify')}
          </>
        ) : isFlood ? (
          <>
            Try again in{' '}
            <FloodCountdown remaining={floodRemaining} />
          </>
        ) : (
          t('codeStep.verify')
        )}
      </Button>
    </form>
  )
}

// 2FA password step — conditional, only rendered when state.step === 'needPassword'.
// Wrong-password inline error, Back link, loading state (D-09).

import React, { useState, useCallback } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { Label } from '@renderer/components/ui/label'
import { getErrorCopy } from './errorCopy'
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
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const hint =
    authState.step === 'needPassword' && authState.hint ? authState.hint : null

  const isFlood = authState.step === 'floodWait' && authState.retryStep === 'password'
  const isProcessing = authState.step === 'verifying' || isSubmitting

  // Error on password step
  const serverError =
    authState.step === 'error' && authState.retryStep === 'password'
      ? getErrorCopy(authState.code)
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
          Back
        </button>
      </div>

      {/* Title + hint */}
      <div className="space-y-2">
        <h1 className="text-display text-foreground">Two-step verification</h1>
        <p className="text-body text-muted-foreground">
          Your account is protected by a password. Enter it to finish signing in.
        </p>
        {hint && (
          <p className="text-label text-muted-foreground">
            Hint: {hint}
          </p>
        )}
      </div>

      {/* Password input */}
      <div className="space-y-2">
        <Label htmlFor="2fa-password" className="text-label">Password</Label>
        <Input
          id="2fa-password"
          type="password"
          placeholder="Enter password"
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
        aria-label={isFlood ? `Wait ${floodRemaining} seconds before trying again` : 'Sign in'}
      >
        {isProcessing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            Sign in
          </>
        ) : isFlood ? (
          <>
            Try again in{' '}
            <FloodCountdown remaining={floodRemaining} />
          </>
        ) : (
          'Sign in'
        )}
      </Button>
    </form>
  )
}

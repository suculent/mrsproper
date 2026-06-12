// Smart single-field target input with live mode detection (D-01/D-02/D-03/D-04/D-06).
// Mode detection: '@'/letters → username; '+' or digits → phone.
// Phone-bare shows CountryPicker chip (D-02); phone disclosure hint shown in phone mode (D-10).
// Resolution fires only on explicit Find button click or Enter (D-03).
// Paste normalization strips t.me/, https://, leading '@' (D-04).
// FLOOD_WAIT countdown drives the Find button (D-17).

import React, { useState, useCallback, useRef } from 'react'
import { isValidPhoneNumber } from 'libphonenumber-js/min'
import type { CountryCode } from 'libphonenumber-js/min'
import { Loader2, AtSign, Phone, AlertCircle, User } from 'lucide-react'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { Label } from '@renderer/components/ui/label'
import CountryPicker, { DEFAULT_COUNTRY, COUNTRY_OPTIONS } from '@renderer/auth/CountryPicker'
import type { CountryOption } from '@renderer/auth/CountryPicker'
import FloodCountdown from '@renderer/auth/FloodCountdown'
import { cn } from '@renderer/lib/utils'
import { useTargetStore, targetActions } from '@renderer/store/targetStore'
import { useSearchStore, searchActions } from '@renderer/store/searchStore'
import {
  getResolveCopy,
  INVALID_USERNAME_FORMAT_COPY,
  INVALID_PHONE_FORMAT_COPY,
  PHONE_MODE_DISCLOSURE_HINT,
  FLOOD_WAIT_SUBTEXT,
} from './resolveCopy'

// ---------------------------------------------------------------------------
// Mode detection types
// ---------------------------------------------------------------------------

type InputMode = 'none' | 'username' | 'phone-bare' | 'phone-international' | 'name'

// ---------------------------------------------------------------------------
// Locale-based country guess (Pattern "Locale-Based Country Guess")
// Uses Intl.Locale + navigator.language — offline-safe, no IP lookup.
// ---------------------------------------------------------------------------

function guessCountryFromLocale(): CountryOption {
  try {
    const locale = new Intl.Locale(navigator.language)
    const region = locale.region
    if (region) {
      const match = COUNTRY_OPTIONS.find((c) => c.code === region.toUpperCase())
      if (match) return match
    }
  } catch {
    // Ignore errors in Intl APIs
  }
  return DEFAULT_COUNTRY
}

// ---------------------------------------------------------------------------
// Input normalization and mode detection
// ---------------------------------------------------------------------------

/**
 * Normalizes a raw input string by stripping URL prefixes and leading '@'.
 * 't.me/+digits' → '+digits' (international phone prefix preserved).
 * Returns the normalized string.
 */
function normalizeInput(raw: string): string {
  let s = raw.trim()
  // Strip URL schemes
  s = s.replace(/^https?:\/\//i, '')
  // Strip 't.me/' prefix (handles both plain and URL-stripped)
  s = s.replace(/^t\.me\//i, '')
  // Strip leading '@' (for usernames typed or pasted with @)
  // But only if the remaining string doesn't start with '+' (phone with @ prefix is invalid)
  if (s.startsWith('@')) {
    s = s.slice(1)
  }
  return s
}

/**
 * Detects the input mode from the normalized input string.
 */
function detectMode(normalized: string): InputMode {
  if (!normalized) return 'none'
  if (normalized.startsWith('+')) return 'phone-international'
  if (/^\d+$/.test(normalized)) return 'phone-bare'
  // Name mode: whitespace, trailing space after token, or chars outside username charset
  // (diacritics, hyphens, apostrophes, non-Latin) — must run BEFORE username branch
  if (/\s/.test(normalized) || !/^[a-zA-Z0-9_]+$/.test(normalized)) return 'name'
  return 'username'
}

// ---------------------------------------------------------------------------
// E164 / username builder for dispatch
// ---------------------------------------------------------------------------

/**
 * Builds the string to pass to targetActions.resolveTarget().
 * For phone modes: builds an E.164-like string.
 * For username: returns cleaned username (no '@').
 * Per D-06: digits always route to phone — no numeric-ID path.
 */
function buildDispatchValue(
  normalized: string,
  mode: InputMode,
  country: CountryOption
): string {
  if (mode === 'phone-international') {
    // Already has '+', use as-is
    return normalized
  }
  if (mode === 'phone-bare') {
    // Prepend country dial code, strip any leading zeros from national number
    const national = normalized.replace(/^0+/, '') || normalized
    return `${country.dialCode}${national}`
  }
  // Username mode — return normalized (no '@')
  return normalized
}

// ---------------------------------------------------------------------------
// TargetInput component
// ---------------------------------------------------------------------------

export function TargetInput(): React.JSX.Element {
  const { target, governorFloodRemaining } = useTargetStore()
  const search = useSearchStore()
  const [rawInput, setRawInput] = useState('')
  const [country, setCountry] = useState<CountryOption>(guessCountryFromLocale)
  const [localError, setLocalError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Derive mode on every render (no separate state needed)
  const normalized = normalizeInput(rawInput)
  const mode = detectMode(normalized)

  const isPhoneMode = mode === 'phone-bare' || mode === 'phone-international'
  const isNameMode = mode === 'name'
  const isResolving = target.step === 'resolving'
  const isResolved = target.step === 'resolved' || target.step === 'confirmed'
  const isFlood = governorFloodRemaining > 0
  const isNameSearchRunning = search.step === 'searching'

  // Server error from target state
  const serverError =
    target.step === 'error' ? getResolveCopy(target.code) : null
  const displayError = localError ?? serverError

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      // Normalize pasted links inline
      const norm = normalizeInput(value)
      // If normalization changed the value significantly (t.me link pasted), use normalized
      // otherwise use raw to allow natural editing.
      // WR-05: genuine URL pastes ONLY — a leading '@' is NOT a link. Rewriting
      // '@' live made typing the placeholder's own format impossible (every '@'
      // keystroke vanished). The leading '@' is stripped during dispatch
      // normalization instead (D-04 — detectMode/buildDispatchValue already
      // operate on the normalized value).
      const isLink =
        value.trim().match(/^https?:\/\//i) ?? value.trim().match(/^t\.me\//i)
      setRawInput(isLink ? norm : value)
      if (localError) setLocalError(null)
    },
    [localError]
  )

  const handleCountryChange = useCallback(
    (c: CountryOption) => {
      setCountry(c)
      if (localError) setLocalError(null)
    },
    [localError]
  )

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (mode === 'none' || isResolving || isFlood || isNameSearchRunning) return

      // Name mode: dispatch to searchActions.startSearch — never calls resolveTarget
      if (mode === 'name') {
        const trimmed = normalized.trim()
        if (trimmed.length < 2) {
          // TODO: move to searchCopy.ts in Plan 05 when searchCopy module is created
          setLocalError('Type at least 2 letters of their name.')
          return
        }
        setLocalError(null)
        await searchActions.startSearch(trimmed)
        return
      }

      // Client-side validation
      if (mode === 'username') {
        const valid = /^[a-zA-Z0-9_]{5,32}$/.test(normalized)
        if (!valid) {
          setLocalError(INVALID_USERNAME_FORMAT_COPY)
          return
        }
      } else if (mode === 'phone-bare' || mode === 'phone-international') {
        const dispatchVal = buildDispatchValue(normalized, mode, country)
        const valid = isValidPhoneNumber(dispatchVal, country.code as CountryCode)
        if (!valid) {
          setLocalError(INVALID_PHONE_FORMAT_COPY)
          return
        }
      }

      setLocalError(null)
      const dispatchVal = buildDispatchValue(normalized, mode, country)
      await targetActions.resolveTarget(dispatchVal)
    },
    [mode, normalized, isResolving, isFlood, isNameSearchRunning, country]
  )

  const isFindDisabled = mode === 'none' || isResolving || isFlood || isNameSearchRunning
  const hasError = Boolean(displayError)

  // ---------------------------------------------------------------------------
  // Confirmed/resolved collapsed summary
  // ---------------------------------------------------------------------------

  if (isResolved) {
    const resolvedTarget = target.step === 'resolved' || target.step === 'confirmed'
      ? target.target
      : null
    const summary = resolvedTarget
      ? resolvedTarget.username
        ? `@${resolvedTarget.username}`
        : resolvedTarget.name
      : normalized || rawInput

    return (
      <div className="max-w-[560px]">
        <p className="text-label text-muted-foreground font-mono">{summary}</p>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Input state
  // ---------------------------------------------------------------------------

  return (
    <form onSubmit={handleSubmit} noValidate className="max-w-[560px] space-y-4">
      {/* Section heading + hint (xl gap below heading) */}
      <div className="space-y-2">
        <h2 className="text-heading font-semibold text-foreground">
          Who are you removing?
        </h2>
        <p className="text-body text-muted-foreground">
          Enter their @username or phone number. You&rsquo;ll confirm it&rsquo;s the right person before
          anything happens.
        </p>
      </div>

      {/* Input row (md gap below heading block) */}
      <div className="space-y-2">
        <Label htmlFor="target-input" className="sr-only">
          Username or phone number
        </Label>

        {/* Input row: CountryPicker (bare digits only) + Input + mode chip */}
        <div className="flex items-center gap-2">
          {/* CountryPicker chip — left of input, bare-digit phone mode only (D-02) */}
          {mode === 'phone-bare' && (
            <CountryPicker
              value={country}
              onChange={handleCountryChange}
              disabled={isResolving}
            />
          )}

          {/* Main input field */}
          <div className="relative flex-1">
            <Input
              ref={inputRef}
              id="target-input"
              type="text"
              placeholder="@username or phone number"
              value={rawInput}
              onChange={handleInputChange}
              disabled={isResolving}
              aria-invalid={hasError}
              aria-describedby={
                [
                  hasError ? 'target-error' : '',
                  isPhoneMode ? 'phone-hint' : '',
                  isFlood ? 'flood-subtext' : '',
                ]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              className={cn(
                'pr-24', // room for the right-edge mode chip
                hasError && 'border-destructive focus-visible:ring-destructive'
              )}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
            />

            {/* Right-edge detected-mode chip (D-01) — decorative, aria-hidden */}
            {mode !== 'none' && (
              <span
                className="pointer-events-none absolute inset-y-0 right-3 flex items-center gap-1 text-label text-muted-foreground"
                aria-hidden="true"
              >
                {isNameMode ? (
                  <>
                    <User className="h-3.5 w-3.5" />
                    <span>Name</span>
                  </>
                ) : isPhoneMode ? (
                  <>
                    <Phone className="h-3.5 w-3.5" />
                    <span>Phone</span>
                  </>
                ) : (
                  <>
                    <AtSign className="h-3.5 w-3.5" />
                    <span>Username</span>
                  </>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Aria-live announcement for mode changes (for screen readers) */}
        <span className="sr-only" aria-live="polite">
          {mode === 'name'
            ? 'Name search mode detected'
            : mode === 'username'
              ? 'Username mode detected'
              : mode === 'phone-bare' || mode === 'phone-international'
                ? 'Phone mode detected'
                : ''}
        </span>

        {/* Phone disclosure hint (D-10) — shown when phone mode is active */}
        {isPhoneMode && (
          <p id="phone-hint" className="text-label text-muted-foreground">
            {PHONE_MODE_DISCLOSURE_HINT}
          </p>
        )}

        {/* Name-mode hint — shown when name mode is active */}
        {isNameMode && (
          <p className="text-label text-muted-foreground">
            {'Searches members of the groups you administer. First or last name works.'}
          </p>
        )}

        {/* Inline error (D-15) — below hint, above button */}
        {displayError && (
          <p
            id="target-error"
            className="flex items-center gap-1 text-label text-destructive"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {displayError}
          </p>
        )}

        {/* FLOOD_WAIT subtext (D-17) */}
        {isFlood && (
          <p id="flood-subtext" className="text-label text-muted-foreground">
            {FLOOD_WAIT_SUBTEXT}
          </p>
        )}
      </div>

      {/* Find button (D-17) */}
      <Button
        type="submit"
        disabled={isFindDisabled}
        aria-label={
          isFlood
            ? `Wait ${governorFloodRemaining} seconds before trying again`
            : isResolving
              ? 'Finding person…'
              : 'Find person'
        }
      >
        {isResolving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            Find person
          </>
        ) : isFlood ? (
          <>
            Try again in{' '}
            <FloodCountdown remaining={governorFloodRemaining} />
          </>
        ) : (
          'Find person'
        )}
      </Button>
    </form>
  )
}

export default TargetInput

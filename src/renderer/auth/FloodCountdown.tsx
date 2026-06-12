// Live mm:ss countdown component for FLOOD_WAIT state (D-13).
// Renders remaining seconds in monospace so layout doesn't jitter.
// Accepts a `remaining` prop (seconds) from the auth store.
// The component itself is decoupled from the timing source (D-18):
// the Phase 2 governor can feed it directly without UI rework.

import React from 'react'
import { useTranslation } from 'react-i18next'

interface FloodCountdownProps {
  remaining: number  // seconds remaining
}

function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const mm = Math.floor(s / 60).toString().padStart(2, '0')
  const ss = (s % 60).toString().padStart(2, '0')
  return `${mm}:${ss}`
}

export { formatCountdown }

export default function FloodCountdown({ remaining }: FloodCountdownProps): React.JSX.Element {
  const { t } = useTranslation('auth')
  return (
    <span
      className="text-mono text-label text-muted-foreground tabular-nums"
      aria-live="polite"
      aria-label={t('floodCountdownAria', { time: formatCountdown(remaining) })}
    >
      {formatCountdown(remaining)}
    </span>
  )
}

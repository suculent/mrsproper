// App root — renders the correct step component based on auth state.
// Phone → Code → (conditional) 2FA steps in a centered 400px card.
// On authorized, renders the AppShell.

import React, { useCallback, useState } from 'react'
import { useAuthStore } from '@renderer/store/authStore'
import PhoneStep from '@renderer/auth/PhoneStep'
import CodeStep from '@renderer/auth/CodeStep'
import PasswordStep from '@renderer/auth/PasswordStep'
import AppShell from '@renderer/shell/AppShell'

// A "back" handler that resets to idle by calling getAuthState which will push current state
// from main. Actually, we just reset display to show the phone step without a real server call.
// On "Back" from code/password step, we return to phone step display by resetting auth to idle.
// The user will need to re-enter their phone. Main retains the actual flow state.
// This is the simplest correct behavior: Back always goes to phone entry.

type LocalFlow = 'phone' | 'code' | 'password'

export default function App(): React.JSX.Element {
  const { auth, floodRemaining } = useAuthStore()
  // localFlow tracks which UI step we show — matches auth state but also allows Back nav
  const [localFlow, setLocalFlow] = useState<LocalFlow>('phone')

  // Derive display step from auth state
  React.useEffect(() => {
    if (auth.step === 'needCode') {
      setLocalFlow('code')
    } else if (auth.step === 'needPassword') {
      setLocalFlow('password')
    } else if (auth.step === 'authorized') {
      setLocalFlow('phone') // Reset for logout cycle
    } else if (auth.step === 'idle') {
      setLocalFlow('phone')
    }
    // error and floodWait keep the current localFlow (D-12: stay on the step)
  }, [auth.step])

  const handleBackToPhone = useCallback(() => {
    setLocalFlow('phone')
  }, [])

  // Authorized — show the app shell
  if (auth.step === 'authorized') {
    return <AppShell identity={auth.identity} />
  }

  // Determine which step to display
  // floodWait + sendingCode + verifying overlay their spinner/countdown on the current step
  const showCode = localFlow === 'code'
  const showPassword = localFlow === 'password'

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* 3xl (64px) top/bottom breathing room — handled by min-h-screen + flex center */}
      <div
        className="w-full max-w-[400px] bg-card border border-border rounded-lg p-6 shadow-sm"
        style={{ maxWidth: '400px' }}
      >
        {showPassword ? (
          <PasswordStep
            authState={auth}
            floodRemaining={floodRemaining}
            onBack={handleBackToPhone}
          />
        ) : showCode ? (
          <CodeStep
            authState={auth}
            floodRemaining={floodRemaining}
            onBack={handleBackToPhone}
          />
        ) : (
          <PhoneStep
            authState={auth}
            floodRemaining={floodRemaining}
          />
        )}
      </div>
    </div>
  )
}

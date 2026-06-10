import React from 'react'

// Minimal placeholder rendering the app title.
// Real auth UI and app shell arrive in later plans.
export default function App(): React.JSX.Element {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-semibold text-foreground">MrProper</h1>
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    </div>
  )
}

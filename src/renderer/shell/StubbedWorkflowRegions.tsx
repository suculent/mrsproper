// Stubbed workflow regions — D-10: inert, clearly-labeled empty states.
// Target-input area and group-list area placeholders.
// Visibly inactive, not fake-interactive.

import React from 'react'

export default function StubbedWorkflowRegions(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Stubbed target-input region */}
      <section
        className="rounded-lg border border-dashed border-border bg-secondary/40 p-8 text-center"
        aria-label="Target search area — coming soon"
      >
        <h2 className="text-heading text-muted-foreground mb-2">
          Nothing to clean up yet
        </h2>
        <p className="text-body text-muted-foreground">
          Target search and group selection arrive in a later update. You're signed in and ready.
        </p>
      </section>

      {/* Stubbed group-list region */}
      <section
        className="rounded-lg border border-dashed border-border bg-secondary/40 p-8 text-center"
        aria-label="Group list area — coming soon"
        aria-disabled="true"
      >
        <h2 className="text-heading text-muted-foreground mb-2">
          Group list
        </h2>
        <p className="text-body text-muted-foreground">
          Your groups will appear here once a target is selected.
        </p>
      </section>
    </div>
  )
}

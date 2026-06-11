// Workflow regions — target input + card (fully wired, Phase 3) + group-list stub (Phase 4).
// TargetInput and TargetCard replace the former target-search stub.
// Group list section remains a clearly-labelled empty state until Phase 4.

import React from 'react'
import TargetInput from '@renderer/target/TargetInput'
import TargetCard from '@renderer/target/TargetCard'

export default function StubbedWorkflowRegions(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Target input + identity card (Phase 3 — fully wired) */}
      <section aria-label="Target search area">
        <TargetInput />
        <div className="mt-4">
          <TargetCard />
        </div>
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

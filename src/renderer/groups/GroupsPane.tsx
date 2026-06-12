// Top-level groups display component — browse mode (pre-target) and checklist mode (post-confirm).
// No props; reads from groupsStore and targetStore.
// D-12: browse mode shows all admin groups + filter input + refresh button
// D-12: checklist mode shows scan progress + membership-verified rows (actionable first)
// D-01: actionable rows first; greyed rows below; sort toggle A-Z or by member count
// D-05: scan progress shows "checked N / M" counter + thin progress bar
// D-06: checklist is interactive during scan — already-verified rows show checkboxes immediately
// D-13: target change resets pane to browse mode; scan auto-starts on next confirm
// D-14: refresh button — manual only, no automatic re-fetch
// D-15: scan re-runs on every target confirm — no result caching
// Phase 5: removal progress slot, summary band, PEER_FLOOD banner, run-trigger, dialogs

import React, { useEffect, useState } from 'react'
import { Search, RefreshCw, AlertTriangle, Loader2 } from 'lucide-react'
import { ScrollArea } from '../components/ui/scroll-area'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { Alert, AlertDescription } from '../components/ui/alert'
import { useGroupsStore, groupsActions } from '../store/groupsStore'
import { useTargetStore } from '../store/targetStore'
import { useRemovalStore, removalActions } from '../store/removalStore'
import { GroupRow } from './GroupRow'
import { RemovalConfirmDialog } from '../removal/RemovalConfirmDialog'
import { ResumeJobDialog } from '../removal/ResumeJobDialog'
import type { AdminDialogDTO, MembershipStatus } from '@shared/groupTypes'
import {
  SCAN_COPY,
  EMPTY_STATE_COPY,
  GROUP_ERROR_COPY,
} from './groupsCopy'
import { removalCopy } from '../removal/removalCopy'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortMode = 'az' | 'size'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sortDialogs(dialogs: AdminDialogDTO[], sort: SortMode): AdminDialogDTO[] {
  return [...dialogs].sort((a, b) => {
    if (sort === 'az') {
      return a.title.localeCompare(b.title)
    }
    // size: descending member count; nulls go last
    const aCount = a.memberCount ?? -1
    const bCount = b.memberCount ?? -1
    return bCount - aCount
  })
}

// ---------------------------------------------------------------------------
// GroupsPane component
// ---------------------------------------------------------------------------

export function GroupsPane(): React.JSX.Element {
  const { groups, scan, checkedDialogIds } = useGroupsStore()
  const targetState = useTargetStore()
  const { state: removal, pendingJob } = useRemovalStore()

  const [sort, setSort] = useState<SortMode>('az')
  const [filter, setFilter] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  // D-12: mode derivation
  const mode = targetState.target.step === 'confirmed' ? 'checklist' : 'browse'

  // D-13: when mode changes to browse (target reset/change), abort any in-progress scan.
  // CR-01-RENDERER: also fires when scan.step === 'complete' so that a completed scan
  // from target A is aborted when the user resets/changes targets. Belt-and-suspenders
  // alongside CR-01-MAIN (scanner.abortScan() in TARGET_RESET IPC handler).
  useEffect(() => {
    if (mode === 'browse' && (scan.step === 'scanning' || scan.step === 'complete')) {
      void groupsActions.abortScan()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // D-13/D-15: when target is confirmed and scan is idle, auto-start scan
  useEffect(() => {
    if (mode === 'checklist' && scan.step === 'idle') {
      void groupsActions.startScan()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // ---------------------------------------------------------------------------
  // Derived values from target state
  // ---------------------------------------------------------------------------

  const confirmedTarget =
    targetState.target.step === 'confirmed' ? targetState.target.target : null
  const targetName = confirmedTarget?.name ?? ''
  const targetId = confirmedTarget?.id ?? ''
  const targetUsername = confirmedTarget?.username ?? null
  const targetAvatar = confirmedTarget?.avatar ?? null

  // ---------------------------------------------------------------------------
  // Membership status helper
  // ---------------------------------------------------------------------------

  function getMembershipStatus(dialogId: string): MembershipStatus | null {
    if (scan.step === 'scanning' || scan.step === 'complete') {
      const result = scan.results.find((r) => r.dialogId === dialogId)
      return result ? result.status : null
    }
    return null
  }

  // ---------------------------------------------------------------------------
  // Dialog list derivation
  // ---------------------------------------------------------------------------

  const allDialogs = groups.step === 'loaded' ? groups.dialogs : []

  let displayedDialogs: AdminDialogDTO[]

  if (mode === 'browse') {
    // Browse mode: filter by title, sort all
    const filtered =
      filter === ''
        ? allDialogs
        : allDialogs.filter((d) => d.title.toLowerCase().includes(filter.toLowerCase()))
    displayedDialogs = sortDialogs(filtered, sort)
  } else {
    // Checklist mode: partition into actionable and non-actionable, sort each, concat
    const results = scan.step === 'scanning' || scan.step === 'complete' ? scan.results : []

    const actionable: AdminDialogDTO[] = []
    const nonActionable: AdminDialogDTO[] = []

    for (const dialog of allDialogs) {
      const result = results.find((r) => r.dialogId === dialog.id)
      const status = result ? result.status : null

      if (dialog.canAct && (status === 'member' || status === null)) {
        // Actionable: canAct=true and either member or pending (during scan)
        actionable.push(dialog)
      } else {
        // Non-actionable: canAct=false OR status=not-member OR status=failed
        nonActionable.push(dialog)
      }
    }

    displayedDialogs = [
      ...sortDialogs(actionable, sort),
      ...sortDialogs(nonActionable, sort),
    ]
  }

  // ---------------------------------------------------------------------------
  // Scan-derived values
  // ---------------------------------------------------------------------------

  const failedCount =
    scan.step === 'complete' ? scan.results.filter((r) => r.status === 'failed').length : 0

  const checkedCount = checkedDialogIds.size

  // ---------------------------------------------------------------------------
  // Removal run state helpers
  // ---------------------------------------------------------------------------

  const isRunActive =
    removal.step === 'running' || removal.step === 'stopping'

  // Derive removalStatus for a given dialog
  function getRemovalStatus(
    dialogId: string
  ): 'queued' | 'removing' | 'done' | 'already-gone' | 'failed' | 'skipped' | null {
    const runActive =
      removal.step === 'running' ||
      removal.step === 'stopping' ||
      removal.step === 'complete' ||
      removal.step === 'stopped' ||
      removal.step === 'hard-stopped'

    if (!runActive) return null

    // Check for a recorded outcome
    const outcome = removal.outcomes.find((o) => o.dialogId === dialogId)
    if (outcome) {
      return outcome.status
    }

    // Currently being processed
    if (removal.step === 'running' && dialogId === removal.currentGroupId) {
      return 'removing'
    }

    // In the run but not yet processed — show as queued
    return 'queued'
  }

  // ---------------------------------------------------------------------------
  // Empty state derivation
  // ---------------------------------------------------------------------------

  function renderEmptyState(): React.JSX.Element | null {
    if (mode === 'browse') {
      if (groups.step === 'loading') {
        return (
          <div className="flex flex-col gap-2 px-4 py-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse bg-muted rounded" />
            ))}
          </div>
        )
      }
      if (groups.step === 'error') {
        return (
          <p className="px-4 py-4 text-label text-muted-foreground">
            {GROUP_ERROR_COPY[groups.code]}
          </p>
        )
      }
      if (groups.step === 'loaded' && filter !== '' && displayedDialogs.length === 0) {
        return (
          <div className="px-4 py-8 flex flex-col gap-1">
            <span className="text-label font-semibold">{EMPTY_STATE_COPY.noMatches.heading}</span>
            <span className="text-body text-muted-foreground">{EMPTY_STATE_COPY.noMatches.body}</span>
          </div>
        )
      }
      if (groups.step === 'loaded' && allDialogs.length === 0) {
        return (
          <div className="px-4 py-8 flex flex-col gap-1">
            <span className="text-label font-semibold">{EMPTY_STATE_COPY.noGroups.heading}</span>
            <span className="text-body text-muted-foreground">{EMPTY_STATE_COPY.noGroups.body}</span>
          </div>
        )
      }
      return null
    }

    // Checklist mode — show "not in any" when scan complete and no actionable (member) rows
    if (mode === 'checklist' && scan.step === 'complete') {
      const memberRows = scan.results.filter((r) => r.status === 'member')
      if (memberRows.length === 0) {
        const copy = EMPTY_STATE_COPY.notInAny(targetName)
        return (
          <div className="px-4 py-8 flex flex-col gap-1">
            <span className="text-label font-semibold">{copy.heading}</span>
            <span className="text-body text-muted-foreground">{copy.body}</span>
          </div>
        )
      }
    }

    return null
  }

  const emptyState = renderEmptyState()

  // ---------------------------------------------------------------------------
  // Progress / summary slot (between toolbar and scroll list)
  // ---------------------------------------------------------------------------

  function renderProgressSlot(): React.JSX.Element | null {
    // Only in checklist mode
    if (mode !== 'checklist') return null

    // a. Removal progress (running or stopping)
    if (removal.step === 'running' || removal.step === 'stopping') {
      const processed = removal.progress.processed
      const total = removal.progress.total
      const pct = total > 0 ? Math.round((processed / total) * 100) : 0
      const isStopping = removal.step === 'stopping'

      return (
        <div className="px-4 py-2 shrink-0" role="status" aria-live="polite">
          <div className="flex items-center justify-between mb-1">
            <span className="text-label text-muted-foreground">
              {removalCopy.progressLabel(targetName, processed + 1, total)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="text-label text-muted-foreground hover:text-foreground"
              onClick={() => void removalActions.abortRemoval()}
              disabled={isStopping}
              aria-label="Stop the removal run"
            >
              {isStopping ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />
                  {removalCopy.stoppingLabel}
                </>
              ) : (
                removalCopy.stopLabel
              )}
            </Button>
          </div>
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-[width] duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )
    }

    // b. PEER_FLOOD banner (hard-stopped)
    if (removal.step === 'hard-stopped') {
      return (
        <div className="px-4 py-2 shrink-0">
          <Alert
            variant="destructive"
            className="bg-destructive/10 border-destructive/30"
            role="alert"
            aria-live="assertive"
          >
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <AlertDescription className="text-body">
              {removalCopy.peerFloodBanner}
              <div className="mt-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    // Resume via ResumeJobDialog — set pendingJob flag will render it
                    // The dialog handles resume semantics from the stored job
                    if (pendingJob) {
                      void removalActions.startRemoval(
                        pendingJob.severity,
                        pendingJob.dialogIds.filter(
                          (id) => !pendingJob.outcomes.find((o) => o.dialogId === id)
                        )
                      )
                    }
                  }}
                >
                  {removalCopy.peerFloodResumeLabel}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      )
    }

    // c. Summary band (complete or stopped)
    if (removal.step === 'complete' || removal.step === 'stopped') {
      const summary = removal.summary
      return (
        <div className="px-4 py-2 shrink-0 border-t border-border flex flex-col gap-0.5" role="status">
          {removal.step === 'stopped' && (
            <span className="text-label text-muted-foreground">
              {removalCopy.summaryStopped(removal.progress.processed, removal.progress.total)}
            </span>
          )}
          {summary && (
            <span className="text-label text-foreground font-semibold">
              {removalCopy.summaryLine({
                removed: summary.removed,
                alreadyGone: summary.alreadyGone,
                failed: summary.failed,
                skipped: summary.skipped,
              })}
            </span>
          )}
          {summary && summary.failed > 0 && (
            <span className="text-label text-muted-foreground">
              {removalCopy.summaryFailed(summary.failed)}
            </span>
          )}
          {summary && summary.completedAt && (
            <span className="text-label text-muted-foreground">
              {removalCopy.summaryTimestamp(summary.completedAt)}
            </span>
          )}
        </div>
      )
    }

    // d. Scan progress (existing render — when scan is scanning and removal is idle)
    if (scan.step === 'scanning' && removal.step === 'idle') {
      return (
        <div className="px-4 py-2 shrink-0" role="status" aria-live="polite">
          <div className="flex items-center justify-between mb-1">
            <span className="text-label text-muted-foreground">{SCAN_COPY.scanning}</span>
            <span className="text-label font-semibold text-foreground">
              checked {scan.progress.checked} / {scan.progress.total}
            </span>
          </div>
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-[width] duration-200"
              style={{
                width: `${scan.progress.total > 0 ? Math.round((scan.progress.checked / scan.progress.total) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
      )
    }

    return null
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar — sticky above scroll list */}
      <div className="flex items-center gap-2 p-4 shrink-0 border-b border-border">
        {/* Browse mode: filter input */}
        {mode === 'browse' && (
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter groups"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-8"
            />
          </div>
        )}

        {/* Sort toggle (both modes) */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSort((s) => (s === 'az' ? 'size' : 'az'))}
          aria-pressed={sort === 'size'}
        >
          {sort === 'az' ? 'A–Z' : 'By size'}
        </Button>

        {/* Refresh button — disabled during removal run */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void groupsActions.refreshGroups()}
          aria-label="Refresh group list"
          title={isRunActive ? 'Removal in progress' : 'Re-fetch your group list from Telegram'}
          aria-disabled={isRunActive}
          disabled={isRunActive}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>

        {/* Run-trigger button — checklist mode, scan complete, ≥1 checked, removal idle */}
        {mode === 'checklist' && scan.step === 'complete' && checkedCount > 0 && (
          removal.step === 'idle' ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmOpen(true)}
              aria-label={`Ban ${targetName} from ${checkedCount} group${checkedCount === 1 ? '' : 's'}`}
            >
              {removalCopy.runTriggerLabel('ban', checkedCount)}
            </Button>
          ) : removal.step === 'stopping' ? (
            // Disabled (not hidden) while stopping — UI-SPEC
            <Button
              variant="destructive"
              size="sm"
              aria-disabled="true"
              disabled={true}
            >
              {removalCopy.runTriggerLabel('ban', checkedCount)}
            </Button>
          ) : null
        )}
      </div>

      {/* Progress / summary slot (replaces the old scan-only progress block) */}
      {renderProgressSlot()}

      {/* Failed rows summary (checklist mode, scan complete, no removal active) */}
      {mode === 'checklist' && failedCount > 0 && !isRunActive && removal.step === 'idle' && (
        <p className="px-4 py-1 shrink-0 text-label text-muted-foreground">
          {SCAN_COPY.failedN(failedCount)}
        </p>
      )}

      {/* Group list */}
      <ScrollArea className="flex-1">
        {emptyState ?? (
          <div className="divide-y divide-border">
            {displayedDialogs.map((dialog) => {
              const rowRemovalStatus = getRemovalStatus(dialog.id)
              const outcome = removal.outcomes.find((o) => o.dialogId === dialog.id)
              return (
                <GroupRow
                  key={dialog.id}
                  dialog={dialog}
                  membershipStatus={getMembershipStatus(dialog.id)}
                  isChecked={checkedDialogIds.has(dialog.id)}
                  onToggle={isRunActive ? () => {} : groupsActions.toggleGroup}
                  onRetry={isRunActive ? () => {} : (dialogId) => void groupsActions.retryScanGroup(dialogId)}
                  removalStatus={rowRemovalStatus}
                  removalNote={outcome?.note ?? null}
                  errorCode={outcome?.errorCode ?? null}
                  severity={removal.severity ?? 'ban'}
                  onRetryRemoval={(id) => void removalActions.retryGroup(id)}
                />
              )
            })}
          </div>
        )}
      </ScrollArea>

      {/* ResumeJobDialog — on mount when incomplete job present */}
      {pendingJob && pendingJob.status !== 'complete' && (
        <ResumeJobDialog
          open={true}
          onOpenChange={() => {}}
          job={pendingJob}
        />
      )}

      {/* RemovalConfirmDialog — opened by run-trigger button */}
      <RemovalConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        severity="ban"
        targetId={targetId}
        targetName={targetName}
        targetUsername={targetUsername}
        targetAvatar={targetAvatar}
        dialogIds={[...checkedDialogIds]}
      />
    </div>
  )
}

export default GroupsPane

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
import { useTranslation } from 'react-i18next'
import { ScrollArea } from '../components/ui/scroll-area'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { Alert, AlertDescription } from '../components/ui/alert'
import { useGroupsStore, groupsActions } from '../store/groupsStore'
import { useTargetStore, targetActions } from '../store/targetStore'
import { useRemovalStore, removalActions } from '../store/removalStore'
import { useTagStore, tagActions } from '../store/tagStore'
import { useAddStore, addActions } from '../store/addStore'
import { addClient } from '../ipc/addClient'
import { GroupRow } from './GroupRow'
import { ModeSwitch } from './ModeSwitch'
import { getAddEmptyState, isAddStatusInJob, getPaneView, getJobRows } from './addPaneState'
import { isJobFinished } from '@shared/addResume'
import { isActionableForMode, type GroupMode } from './modeRules'
import type { AdminDialogDTO, MembershipStatus } from '@shared/groupTypes'
import type { WizardStage } from '../wizard/StepIndicator'
import { formatTime } from '@renderer/lib/format'
import FloodCountdown from '../auth/FloodCountdown'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortMode = 'az' | 'size'

interface GroupsPaneProps {
  onNavigateToReview: () => void
  onNavigateToTarget: () => void
  stage: WizardStage
  /** The active Remove/Tag/Add mode (D-01). */
  activeMode?: GroupMode
  /** Called when the mode switch changes mode. */
  onModeChange?: (mode: GroupMode) => void
}

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

export function GroupsPane(props: GroupsPaneProps): React.JSX.Element {
  const { onNavigateToReview, onNavigateToTarget } = props
  // D-01: AppShell always passes activeMode/onModeChange; the 'remove' default and no-op
  // fallback below only protect callers (e.g. tests) that mount GroupsPane without them.
  const requestedMode = props.activeMode ?? 'remove'
  const handleModeChange = props.onModeChange ?? (() => {})
  const { t: tG } = useTranslation('groups')
  const { t: tR } = useTranslation('removal')
  const { t: tW } = useTranslation('wizard')
  const { t: tT } = useTranslation('tag')
  const { t: tAdd } = useTranslation('add')

  const { groups, scan, checkedDialogIds } = useGroupsStore()
  const targetState = useTargetStore()
  const { state: removal } = useRemovalStore()
  const { state: tag } = useTagStore()
  const { state: add } = useAddStore()

  // D-02: a non-idle add job always renders Add branches, even before AppShell's effect
  // has switched the mode (first render after relaunch Resume).
  const activeMode: GroupMode = add.step !== 'idle' ? 'add' : requestedMode
  // D-01/T-17-16: labels come from the job's main-provided identity, never the renderer target.
  const addTargetName = add.targetName

  const [sort, setSort] = useState<SortMode>('az')
  const [filter, setFilter] = useState('')
  // D-20: transient "No add log yet" inline message next to the Export add log button
  const [exportLogMessage, setExportLogMessage] = useState<string | null>(null)
  // D-11: shared in-flight/failed state for the stopped-band and PEER_FLOOD Resume buttons.
  const [resumeState, setResumeState] = useState<'idle' | 'inflight' | 'failed'>('idle')
  async function handleResumeAdd(): Promise<void> {
    setResumeState('inflight')
    const ok = await addActions.resumeJobFromDisk()
    setResumeState(ok ? 'idle' : 'failed')
  }

  // D-12: mode derivation
  // D-04: 'job' = non-idle add job with no confirmed target (relaunch resume).
  const view = getPaneView(add.step, targetState.target.step)
  const isJob = view === 'job'
  const mode: 'browse' | 'checklist' = view === 'checklist' ? 'checklist' : 'browse'

  // D-13: when mode changes to browse (target reset/change), abort any in-progress scan.
  // CR-01-RENDERER: also fires when scan.step === 'complete' so that a completed scan
  // from target A is aborted when the user resets/changes targets. Belt-and-suspenders
  // alongside CR-01-MAIN (scanner.abortScan() in TARGET_RESET IPC handler).
  useEffect(() => {
    if (view === 'browse' && (scan.step === 'scanning' || scan.step === 'complete')) {
      void groupsActions.abortScan()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  // D-13/D-15: when target is confirmed and scan is idle, auto-start scan
  useEffect(() => {
    if (view === 'checklist' && scan.step === 'idle') {
      void groupsActions.startScan()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  // ---------------------------------------------------------------------------
  // Derived values from target state
  // ---------------------------------------------------------------------------

  const confirmedTarget =
    targetState.target.step === 'confirmed' ? targetState.target.target : null
  const targetName = confirmedTarget?.name ?? ''

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

  if (isJob) {
    // D-03: only the job's groups, in job order; filter narrows, sort toggle ignored
    const jobRows = getJobRows(allDialogs, add.dialogIds)
    displayedDialogs =
      filter === ''
        ? jobRows
        : jobRows.filter((d) => d.title.toLowerCase().includes(filter.toLowerCase()))
  } else if (mode === 'browse') {
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

      // D-03/D-05: route through the single shared predicate — never a duplicated inline
      // rule — so Remove/Tag/Add partitioning can never silently drift from groupsStore's
      // pre-check rebuild (modeRules.ts).
      if (isActionableForMode(dialog, status, activeMode)) {
        actionable.push(dialog)
      } else {
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
    removal.step === 'running' || removal.step === 'stopping' ||
    tag.step === 'running' || tag.step === 'stopping' ||
    add.step === 'running' || add.step === 'stopping'

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

  // Derive tagStatus for a given dialog
  function getTagStatus(
    dialogId: string
  ): 'queued' | 'tagging' | 'done' | 'skipped' | 'failed' | null {
    const tagActive =
      tag.step === 'running' || tag.step === 'stopping' ||
      tag.step === 'complete' || tag.step === 'stopped' || tag.step === 'hard-stopped'

    if (!tagActive) return null

    const outcome = tag.outcomes.find((o) => o.dialogId === dialogId)
    if (outcome) return outcome.status as 'done' | 'skipped' | 'failed'

    if (tag.step === 'running' && dialogId === tag.currentGroupId) return 'tagging'

    return 'queued'
  }

  // Derive addStatus for a given dialog (mirrors getTagStatus's structure)
  function getAddStatus(
    dialogId: string
  ): 'queued' | 'adding' | 'done' | 'already-member' | 'privacy-blocked' | 'failed' | 'skipped' | null {
    const addActive =
      add.step === 'running' || add.step === 'stopping' ||
      add.step === 'complete' || add.step === 'stopped' || add.step === 'hard-stopped'

    if (!addActive) return null

    // D-16: rows outside the job's dialogIds show no run status (not 'queued')
    if (!isAddStatusInJob(dialogId, add.dialogIds)) return null

    const outcome = add.outcomes.find((o) => o.dialogId === dialogId)
    if (outcome) return outcome.status

    if (add.step === 'running' && dialogId === add.currentGroupId) return 'adding'

    return 'queued'
  }

  // ---------------------------------------------------------------------------
  // Empty state derivation
  // ---------------------------------------------------------------------------

  function renderEmptyState(): React.JSX.Element | null {
    // D-03: the job view never shows browse/scan empty states
    if (isJob) return null

    // D-14: zero dialogs in Add checklist mode must not render a blank list
    if (mode === 'checklist' && activeMode === 'add' && groups.step === 'loaded' && allDialogs.length === 0) {
      return (
        <div className="px-4 py-8 flex flex-col gap-1">
          <span className="text-label font-semibold">{tG('emptyState.noGroups.heading')}</span>
          <span className="text-body text-muted-foreground">{tG('emptyState.noGroups.body')}</span>
        </div>
      )
    }

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
            {tG(`groupError.${groups.code}`)}
          </p>
        )
      }
      if (groups.step === 'loaded' && filter !== '' && displayedDialogs.length === 0) {
        return (
          <div className="px-4 py-8 flex flex-col gap-1">
            <span className="text-label font-semibold">{tG('emptyState.noMatches.heading')}</span>
            <span className="text-body text-muted-foreground">{tG('emptyState.noMatches.body')}</span>
          </div>
        )
      }
      if (groups.step === 'loaded' && allDialogs.length === 0) {
        return (
          <div className="px-4 py-8 flex flex-col gap-1">
            <span className="text-label font-semibold">{tG('emptyState.noGroups.heading')}</span>
            <span className="text-body text-muted-foreground">{tG('emptyState.noGroups.body')}</span>
          </div>
        )
      }
      return null
    }

    // Checklist mode — scan complete
    if (mode === 'checklist' && scan.step === 'complete') {
      if (activeMode === 'add') {
        // D-06: Add empty state only when no row is actionable. failedCount > 0 keeps the
        // checklist visible so verify-failed rows can still be retried (confirm at UAT).
        const addEmpty = getAddEmptyState(
          allDialogs,
          (id) => scan.results.find((r) => r.dialogId === id)?.status ?? null,
          failedCount
        )
        if (addEmpty === 'no-groups') {
          return (
            <div className="px-4 py-8 flex flex-col gap-1">
              <span className="text-label font-semibold">{tG('emptyState.noGroups.heading')}</span>
              <span className="text-body text-muted-foreground">{tG('emptyState.noGroups.body')}</span>
            </div>
          )
        }
        if (addEmpty !== 'none') {
          return (
            <div className="px-4 py-8 flex flex-col gap-1">
              <span className="text-label font-semibold">{tG('emptyState.nothingToAddHeading')}</span>
              <span className="text-body text-muted-foreground">
                {tG(addEmpty === 'all-member' ? 'emptyState.allAlreadyMember' : 'emptyState.cannotAddBody', { name: targetName })}
              </span>
            </div>
          )
        }
      } else {
        // Remove / Tag — "not in any" when no member rows
        const memberRows = scan.results.filter((r) => r.status === 'member')
        if (memberRows.length === 0) {
          return (
            <div className="px-4 py-8 flex flex-col gap-1">
              <span className="text-label font-semibold">{tG('emptyState.notInAnyHeading', { name: targetName })}</span>
              <span className="text-body text-muted-foreground">
                {tG(activeMode === 'tag' ? 'emptyState.notInAnyBodyTag' : 'emptyState.notInAnyBody', { name: targetName })}
              </span>
            </div>
          )
        }
      }
    }

    return null
  }

  const emptyState = renderEmptyState()

  // ---------------------------------------------------------------------------
  // Progress / summary slot (between toolbar and scroll list)
  // ---------------------------------------------------------------------------

  function renderProgressSlot(): React.JSX.Element | null {
    // Only in checklist mode, or the add job view (D-04: the Add slot is never hidden)
    if (mode !== 'checklist' && !isJob) return null

    // TAG BRANCHES — gated on activeMode === 'tag'; placed before removal branches
    if (activeMode === 'tag') {
      // a-tag. Tag progress (running or stopping)
      if (tag.step === 'running' || tag.step === 'stopping') {
        const processed = tag.progress.processed
        const total = tag.progress.total
        const pct = total > 0 ? Math.round((processed / total) * 100) : 0
        const isStopping = tag.step === 'stopping'

        return (
          <div className="px-4 py-2 shrink-0" role="status" aria-live="polite">
            <div className="flex items-center justify-between mb-1">
              <span className="text-label text-muted-foreground">
                {tT('progressLabel', { name: targetName, x: processed + 1, n: total })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-label text-muted-foreground hover:text-foreground"
                onClick={() => void tagActions.abortTag()}
                disabled={isStopping}
                aria-label={tT('stopTagAria')}
              >
                {isStopping ? (
                  <>
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />
                    {tT('stoppingLabel')}
                  </>
                ) : (
                  tT('stopLabel')
                )}
              </Button>
            </div>
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-[width] duration-200"
                style={{ width: `${pct}%` }}
              />
            </div>
            {tag.floodWaitRemaining != null && tag.floodWaitRemaining > 0 && (
              <span className="text-label text-muted-foreground flex items-baseline gap-1">
                {tT('floodWaitSubline')}
                <FloodCountdown remaining={tag.floodWaitRemaining} />
              </span>
            )}
          </div>
        )
      }

      // b-tag. PEER_FLOOD banner (hard-stopped)
      if (tag.step === 'hard-stopped') {
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
                {tT('peerFloodBanner')}
                <div className="mt-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => void tagActions.resumeJobFromDisk()}
                  >
                    {tT('peerFloodResumeLabel')}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          </div>
        )
      }

      // c-tag. Summary band (complete or stopped)
      if (tag.step === 'complete' || tag.step === 'stopped') {
        const summary = tag.summary
        const summaryParts: Array<{ label: string; count: number }> = []
        if (summary) {
          if (summary.tagged > 0) summaryParts.push({ count: summary.tagged, label: tT('summaryPart.tagged') })
          if (summary.skipped > 0) summaryParts.push({ count: summary.skipped, label: tT('summaryPart.skipped') })
          if (summary.failed > 0) summaryParts.push({ count: summary.failed, label: tT('summaryPart.failed') })
        }
        return (
          <div className="px-4 py-2 shrink-0 border-t border-border flex items-center justify-between gap-2 flex-wrap" role="status">
            <div className="flex flex-col gap-1">
              {tag.step === 'stopped' && (
                <span className="text-label text-muted-foreground">
                  {tT('summaryStopped', { x: tag.progress.processed, n: tag.progress.total })}
                </span>
              )}
              {summaryParts.length > 0 && (
                <span className="text-label">
                  {summaryParts.map((part, i) => (
                    <React.Fragment key={part.label}>
                      {i > 0 && <span className="text-muted-foreground"> · </span>}
                      <span className="font-semibold text-foreground">{part.count}</span>
                      {' '}
                      <span className="text-muted-foreground">{part.label}</span>
                    </React.Fragment>
                  ))}
                </span>
              )}
              {summary && summary.completedAt && (
                <span className="text-label text-muted-foreground">
                  {tT('finishedAt', { time: formatTime(summary.completedAt) })}
                </span>
              )}
              {/* NOTE: no summaryFailed retry copy — tag has no per-group retry */}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => { await targetActions.resetTarget(); onNavigateToTarget() }}
            >
              {tW('tagSomeoneElse')}
            </Button>
          </div>
        )
      }

      // Tag is idle — fall through to scan progress slot (d)
    }

    // ADD BRANCHES — gated on activeMode === 'add'; placed before removal branches,
    // structurally identical to the Tag block above (D-17/D-18/D-19/D-20)
    if (activeMode === 'add') {
      // a-add. Add progress (running or stopping)
      if (add.step === 'running' || add.step === 'stopping') {
        const processed = add.progress.processed
        const total = add.progress.total
        const pct = total > 0 ? Math.round((processed / total) * 100) : 0
        const isStopping = add.step === 'stopping'

        return (
          <div className="px-4 py-2 shrink-0" role="status" aria-live="polite">
            <div className="flex items-center justify-between mb-1">
              <span className="text-label text-muted-foreground">
                {tAdd('progressLabel', { name: addTargetName, x: processed + 1, n: total })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-label text-muted-foreground hover:text-foreground"
                onClick={() => void addActions.abortAdd()}
                disabled={isStopping}
                aria-label={tAdd('stopAddAria')}
              >
                {isStopping ? (
                  <>
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />
                    {tAdd('stoppingLabel')}
                  </>
                ) : (
                  tAdd('stopLabel')
                )}
              </Button>
            </div>
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-[width] duration-200"
                style={{ width: `${pct}%` }}
              />
            </div>
            {add.floodWaitRemaining != null && add.floodWaitRemaining > 0 && (
              <span className="text-label text-muted-foreground flex items-baseline gap-1">
                {tAdd('floodWaitSubline')}
                <FloodCountdown remaining={add.floodWaitRemaining} />
              </span>
            )}
          </div>
        )
      }

      // b-add. PEER_FLOOD banner (hard-stopped)
      if (add.step === 'hard-stopped') {
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
                {tAdd('peerFloodBanner')}
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <Button
                    variant="default"
                    size="sm"
                    disabled={resumeState === 'inflight'}
                    aria-describedby={resumeState === 'failed' ? 'add-resume-failed-peerflood' : undefined}
                    onClick={() => void handleResumeAdd()}
                  >
                    {resumeState === 'inflight' ? (
                      <>
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />
                        {tAdd('confirmDispatching')}
                      </>
                    ) : (
                      tAdd('peerFloodResumeLabel')
                    )}
                  </Button>
                  {/* CR-02 (D-09): the only exit from a hard-stopped job — in the relaunch job
                      view nothing else (toolbar, target card, lookup) can leave it. */}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={resumeState === 'inflight'}
                    onClick={async () => { await targetActions.resetTarget(); onNavigateToTarget() }}
                  >
                    {tAdd('addSomeoneElse')}
                  </Button>
                </div>
                {resumeState === 'failed' && (
                  <div id="add-resume-failed-peerflood" className="mt-2 text-label font-normal text-destructive">
                    {tAdd('resumeFailedBand')}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          </div>
        )
      }

      // c-add. Summary band (complete or stopped)
      if (add.step === 'complete' || add.step === 'stopped') {
        const summary = add.summary
        const summaryParts: Array<{ label: string; count: number }> = []
        if (summary) {
          if (summary.added > 0) summaryParts.push({ count: summary.added, label: tAdd('summaryPart.added') })
          if (summary.alreadyMember > 0) summaryParts.push({ count: summary.alreadyMember, label: tAdd('summaryPart.alreadyMember') })
          if (summary.privacyBlocked > 0) summaryParts.push({ count: summary.privacyBlocked, label: tAdd('summaryPart.privacyBlocked') })
          if (summary.failed > 0) summaryParts.push({ count: summary.failed, label: tAdd('summaryPart.failed') })
          if (summary.skipped > 0) summaryParts.push({ count: summary.skipped, label: tAdd('summaryPart.skipped') })
        }

        async function handleExportAddLog(): Promise<void> {
          // WR-02: the main-process handler no longer throws, but catch defensively at the
          // call site too so a future regression there can't become an unhandled rejection.
          try {
            const result = await addClient.exportAddLog()
            if (!result.ok && result.reason === 'no-log') {
              setExportLogMessage(tAdd('exportLogNoLogYet'))
              setTimeout(() => setExportLogMessage(null), 4000)
            }
          } catch (err) {
            console.error('Failed to export add log', err)
          }
        }

        // D-11: Resume only for a stopped job that still has unprocessed groups; never 'complete'.
        const canResume =
          add.step === 'stopped' &&
          (add.dialogIds?.length ?? 0) > 0 &&
          !isJobFinished({ dialogIds: add.dialogIds ?? [], outcomes: add.outcomes })
        const resumeDisabled = resumeState === 'inflight' || groups.step !== 'loaded'

        return (
          <div className="px-4 py-2 shrink-0 border-t border-border flex items-center justify-between gap-2 flex-wrap" role="status">
            <div className="flex flex-col gap-1">
              {add.step === 'stopped' && (
                <span className="text-label text-muted-foreground">
                  {tAdd('summaryStopped', { x: add.progress.processed, n: add.progress.total })}
                </span>
              )}
              {summaryParts.length > 0 && (
                <span className="text-label">
                  {summaryParts.map((part, i) => (
                    <React.Fragment key={part.label}>
                      {i > 0 && <span className="text-muted-foreground"> · </span>}
                      <span className="font-semibold text-foreground">{part.count}</span>
                      {' '}
                      <span className="text-muted-foreground">{part.label}</span>
                    </React.Fragment>
                  ))}
                </span>
              )}
              {summary && summary.failed > 0 && (
                <span className="text-label text-muted-foreground">
                  {tAdd('summaryFailed', { count: summary.failed })}
                </span>
              )}
              {summary && summary.completedAt && (
                <span className="text-label text-muted-foreground">
                  {tAdd('finishedAt', { time: formatTime(summary.completedAt) })}
                </span>
              )}
              {/* D-19: DM status line — sent/refused render a line, not-needed renders nothing */}
              {add.dmStatus === 'sent' && (
                <span className="text-label text-muted-foreground">
                  {tAdd('dmStatusSent', { name: addTargetName })}
                </span>
              )}
              {add.dmStatus === 'refused' && (
                <span className="text-label text-foreground">
                  {tAdd('dmStatusRefused', { name: addTargetName })}
                </span>
              )}
              {exportLogMessage != null && (
                <span className="text-label text-muted-foreground">{exportLogMessage}</span>
              )}
              {canResume && resumeState === 'failed' && (
                <span id="add-resume-failed-band" className="text-label font-normal text-destructive">
                  {tAdd('resumeFailedBand')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {canResume && (
                <Button
                  variant="default"
                  size="sm"
                  aria-label={tAdd('resumeStoppedAria')}
                  aria-describedby={resumeState === 'failed' ? 'add-resume-failed-band' : undefined}
                  disabled={resumeDisabled}
                  title={groups.step !== 'loaded' ? tAdd('resumeLoadingGroups') : undefined}
                  onClick={() => void handleResumeAdd()}
                >
                  {resumeState === 'inflight' ? (
                    <>
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />
                      {tAdd('confirmDispatching')}
                    </>
                  ) : (
                    tAdd('peerFloodResumeLabel')
                  )}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleExportAddLog()}
              >
                {tAdd('exportLogButton')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => { await targetActions.resetTarget(); onNavigateToTarget() }}
              >
                {tAdd('addSomeoneElse')}
              </Button>
            </div>
          </div>
        )
      }

      // Add is idle — fall through to scan progress slot (d)
    }

    // EXISTING REMOVAL BRANCHES (unchanged) — placed after tag block

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
              {tR('progressLabel', { name: targetName, x: processed + 1, n: total })}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="text-label text-muted-foreground hover:text-foreground"
              onClick={() => void removalActions.abortRemoval()}
              disabled={isStopping}
              aria-label={tG('stopRemovalAria')}
            >
              {isStopping ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />
                  {tR('stoppingLabel')}
                </>
              ) : (
                tR('stopLabel')
              )}
            </Button>
          </div>
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-[width] duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
          {removal.floodWaitRemaining != null && removal.floodWaitRemaining > 0 && (
            <span className="text-label text-muted-foreground flex items-baseline gap-1">
              {tR('floodWaitSubline')}
              <FloodCountdown remaining={removal.floodWaitRemaining} />
            </span>
          )}
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
              {tR('peerFloodBanner')}
              <div className="mt-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    // WR-03: re-read job from disk to get authoritative remaining groups
                    // (in-memory pendingJob may be a stale on-launch snapshot).
                    // startRemoval() will also clear pendingJob on successful dispatch (CR-05).
                    void removalActions.resumeJobFromDisk()
                  }}
                >
                  {tR('peerFloodResumeLabel')}
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
      const summaryParts: Array<{ label: string; count: number }> = []
      if (summary) {
        if (summary.removed > 0) summaryParts.push({ count: summary.removed, label: tR('summaryPart.removed') })
        if (summary.alreadyGone > 0) summaryParts.push({ count: summary.alreadyGone, label: tR('summaryPart.alreadyGone') })
        if (summary.failed > 0) summaryParts.push({ count: summary.failed, label: tR('summaryPart.failed') })
        if (summary.skipped > 0) summaryParts.push({ count: summary.skipped, label: tR('summaryPart.skipped') })
      }
      return (
        <div className="px-4 py-2 shrink-0 border-t border-border flex items-center justify-between gap-2 flex-wrap" role="status">
          <div className="flex flex-col gap-1">
            {removal.step === 'stopped' && (
              <span className="text-label text-muted-foreground">
                {tR('summaryStopped', { x: removal.progress.processed, n: removal.progress.total })}
              </span>
            )}
            {summaryParts.length > 0 && (
              <span className="text-label">
                {summaryParts.map((part, i) => (
                  <React.Fragment key={part.label}>
                    {i > 0 && <span className="text-muted-foreground"> · </span>}
                    <span className="font-semibold text-foreground">{part.count}</span>
                    {' '}
                    <span className="text-muted-foreground">{part.label}</span>
                  </React.Fragment>
                ))}
              </span>
            )}
            {summary && summary.failed > 0 && (
              <span className="text-label text-muted-foreground">
                {tR('summaryFailed', { count: summary.failed })}
              </span>
            )}
            {summary && summary.completedAt && (
              <span className="text-label text-muted-foreground">
                {tR('finishedAt', { time: formatTime(summary.completedAt) })}
              </span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => { await targetActions.resetTarget(); onNavigateToTarget() }}
          >
            {tW('removeSomeoneElse')}
          </Button>
        </div>
      )
    }

    // d. Scan progress — when scan is scanning and no run is active (removal, tag, or add)
    // WR-05: add.step === 'idle' was missing from this guard — this block predates Add mode
    // and was never extended, unlike every other removal/tag/add parallel block in this file.
    if (scan.step === 'scanning' && removal.step === 'idle' && tag.step === 'idle' && add.step === 'idle') {
      return (
        <div className="px-4 py-2 shrink-0" role="status" aria-live="polite">
          <div className="flex items-center justify-between mb-1">
            <span className="text-label text-muted-foreground">{tG('scan.scanning')}</span>
            <span className="text-label font-semibold text-foreground">
              {tG('scan.checkedCounter', { checked: scan.progress.checked, total: scan.progress.total })}
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
              placeholder={tG('filterPlaceholder')}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-8"
            />
          </div>
        )}

        {/* Checklist mode: "Change target" affordance — navigates back to target step */}
        {/* Disabled while removal is running (T-05-07-B parity with TargetCard button) */}
        {mode === 'checklist' && (
          <Button
            variant="ghost"
            size="sm"
            className="text-label text-muted-foreground hover:text-foreground"
            onClick={async () => { await targetActions.resetTarget(); onNavigateToTarget() }}
            disabled={isRunActive}
            aria-label={tW('changeTargetAria')}
          >
            {tW('changeTarget')}
          </Button>
        )}

        {/* D-01: Remove/Tag/Add mode switch — always rendered, both browse and checklist mode */}
        <ModeSwitch
          mode={activeMode}
          onChange={handleModeChange}
          disabled={scan.step === 'scanning' || isRunActive || props.stage === 'run' || props.stage === 'report' || add.step !== 'idle'}
          lockedByAddJob={add.step !== 'idle'}
        />

        {/* Sort toggle (browse and checklist; the job view keeps job order) */}
        {!isJob && <Button
          variant="ghost"
          size="sm"
          onClick={() => setSort((s) => (s === 'az' ? 'size' : 'az'))}
          aria-pressed={sort === 'size'}
        >
          {sort === 'az' ? tG('sortAz') : tG('sortBySize')}
        </Button>}

        {/* Refresh button — disabled during removal run */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void groupsActions.refreshGroups()}
          aria-label={tG('refreshAria')}
          title={isRunActive ? tG('refreshBlockedTooltip') : tG('refreshTooltip')}
          aria-disabled={isRunActive || add.step !== 'idle'}
          disabled={isRunActive || add.step !== 'idle'}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>

        {/* Run-trigger button — checklist mode, scan complete, ≥1 checked, removal+tag+add idle */}
        {mode === 'checklist' && scan.step === 'complete' && checkedCount > 0 && (
          removal.step === 'idle' && tag.step === 'idle' && add.step === 'idle' ? (
            <Button
              variant="default"
              size="sm"
              onClick={() => onNavigateToReview()}
              aria-label={
                activeMode === 'add'
                  ? tAdd('runTriggerAria', { count: checkedCount })
                  : activeMode === 'tag'
                    ? tT('runTriggerAriaTag', { count: checkedCount })
                    : tW('runTriggerAria', { count: checkedCount })
              }
            >
              {activeMode === 'add'
                ? tAdd('runTriggerLabel', { count: checkedCount })
                : activeMode === 'tag'
                  ? tT('runTriggerLabelTag', { count: checkedCount })
                  : tW('runTriggerLabel', { count: checkedCount })}
            </Button>
          ) : removal.step === 'stopping' ? (
            // Disabled (not hidden) while stopping — UI-SPEC
            <Button
              variant="default"
              size="sm"
              aria-disabled="true"
              disabled={true}
            >
              {activeMode === 'add'
                ? tAdd('runTriggerLabel', { count: checkedCount })
                : activeMode === 'tag'
                  ? tT('runTriggerLabelTag', { count: checkedCount })
                  : tW('runTriggerLabel', { count: checkedCount })}
            </Button>
          ) : null
        )}
      </div>

      {/* Progress / summary slot (replaces the old scan-only progress block) */}
      {renderProgressSlot()}

      {/* Failed rows summary (checklist mode, scan complete, no removal active) */}
      {mode === 'checklist' && failedCount > 0 && !isRunActive && removal.step === 'idle' && (
        <p className="px-4 py-1 shrink-0 text-label text-muted-foreground">
          {tG('scan.failedN', { count: failedCount })}
        </p>
      )}

      {/* Group list */}
      <ScrollArea className="flex-1">
        {emptyState ?? (
          <div className="divide-y divide-border">
            {displayedDialogs.map((dialog) => {
              const rowRemovalStatus = activeMode === 'remove' ? getRemovalStatus(dialog.id) : null
              const outcome = removal.outcomes.find((o) => o.dialogId === dialog.id)
              const tagOutcome = tag.outcomes.find((o) => o.dialogId === dialog.id)
              const addOutcome = add.outcomes.find((o) => o.dialogId === dialog.id)
              return (
                <GroupRow
                  key={dialog.id}
                  dialog={dialog}
                  membershipStatus={getMembershipStatus(dialog.id)}
                  isChecked={isJob ? false : checkedDialogIds.has(dialog.id)}
                  activeMode={activeMode}
                  onToggle={isRunActive || isJob ? () => {} : groupsActions.toggleGroup}
                  onRetry={isRunActive ? () => {} : (dialogId) => void groupsActions.retryScanGroup(dialogId)}
                  removalStatus={rowRemovalStatus}
                  removalNote={activeMode === 'remove' ? (outcome?.note ?? null) : null}
                  errorCode={activeMode === 'remove' ? (outcome?.errorCode ?? null) : null}
                  severity={removal.severity ?? 'ban'}
                  onRetryRemoval={(id) => void removalActions.retryGroup(id)}
                  tagStatus={activeMode === 'tag' ? getTagStatus(dialog.id) : null}
                  tagErrorCode={activeMode === 'tag' ? (tagOutcome?.errorCode ?? null) : null}
                  addStatus={activeMode === 'add' ? getAddStatus(dialog.id) : null}
                  addErrorCode={activeMode === 'add' ? (addOutcome?.errorCode ?? null) : null}
                  addLink={activeMode === 'add' ? (addOutcome?.link ?? null) : null}
                  premiumWouldAllow={activeMode === 'add' ? (addOutcome?.premiumWouldAllow ?? false) : false}
                  onRetryAdd={(id) => {
                    // WR-04: no row retry while a Resume is being dispatched (main also refuses
                    // to start a Resume while a retry is in flight).
                    if (resumeState === 'inflight') return
                    void addActions.retryGroup(id)
                  }}
                  addRetryDmStatus={activeMode === 'add' ? addOutcome?.retryDmStatus : undefined}
                  addTargetName={addTargetName}
                  jobView={isJob}
                />
              )
            })}
          </div>
        )}
      </ScrollArea>

    </div>
  )
}

export default GroupsPane

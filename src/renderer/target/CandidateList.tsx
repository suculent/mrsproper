// State-aware candidate list for name-search results (Phase 4.1, TGT-05).
// Reads from searchStore and renders: progress indicator, Stop search button,
// streaming candidate rows, cap notice, soft-failure note, empty state, error state.
// Renders nothing when search is idle and no candidates exist.
// Analog: src/renderer/groups/GroupsPane.tsx (progress indicator + empty state pattern).

import React, { useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { useSearchStore, searchActions, getLastQuery } from '@renderer/store/searchStore'
import { useTargetStore } from '@renderer/store/targetStore'
import { useGroupsStore } from '@renderer/store/groupsStore'
import { CandidateRow } from './CandidateRow'
import { useTranslation } from 'react-i18next'

// ---------------------------------------------------------------------------
// CandidateList component
// ---------------------------------------------------------------------------

export function CandidateList(): React.JSX.Element | null {
  const { t } = useTranslation('target')
  const search = useSearchStore()
  const { governorFloodRemaining } = useTargetStore()
  const { groups } = useGroupsStore()

  const [selectingId, setSelectingId] = useState<string | null>(null)

  // Render nothing when fully idle with no candidates
  if (search.step === 'idle') return null

  // Derive candidates from the current state
  const candidates = 'candidates' in search ? search.candidates : []

  async function handleSelect(userId: string): Promise<void> {
    setSelectingId(userId)
    await searchActions.selectCandidate(userId)
    setSelectingId(null)
  }

  // Derive total group count for empty state
  const totalGroups =
    groups.step === 'loaded' ? groups.dialogs.length : 0

  const lastQuery = getLastQuery()

  // Error count (present in searching, complete, stopped steps)
  const errorCount = 'errorCount' in search ? search.errorCount : 0

  return (
    <div className="max-w-[560px] space-y-3">
      {/* A. Progress bar block — shown while searching */}
      {search.step === 'searching' && (
        <div role="status" aria-live="polite" className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-label text-muted-foreground">
              {t('search.searching', { x: search.progress.searched, total: search.progress.total })}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="text-label text-muted-foreground hover:text-foreground"
              aria-label={t('search.stopAria')}
              onClick={() => void searchActions.abortSearch()}
            >
              {t('search.stopLabel')}
            </Button>
          </div>
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-[width] duration-200"
              style={{
                width: `${search.progress.total > 0 ? Math.round((search.progress.searched / search.progress.total) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* A2. FLOOD_WAIT subline — shown during search when governor is throttling */}
      {search.step === 'searching' && governorFloodRemaining > 0 && (
        <p className="text-label font-mono text-muted-foreground">
          {t('search.floodSubline')}
        </p>
      )}

      {/* B. Stopped line — shown when search was aborted */}
      {search.step === 'stopped' && (
        <p className="text-label text-muted-foreground">
          {t('search.stopped', { n: candidates.length })}
        </p>
      )}

      {/* C. Candidate list — shown when candidates exist */}
      {candidates.length > 0 && (
        <div
          className="rounded-lg border divide-y divide-border"
          role="list"
          aria-label={t('search.resultsAria')}
        >
          {candidates.map((c) => (
            <CandidateRow
              key={c.id}
              candidate={c}
              onSelect={(userId) => void handleSelect(userId)}
              isSelecting={selectingId === c.id}
              disabled={selectingId !== null && selectingId !== c.id}
            />
          ))}
        </div>
      )}

      {/* D. Cap notice — shown when results hit 100 */}
      {candidates.length >= 100 && (
        <p className="text-label text-muted-foreground px-4 py-2">
          {t('search.capNotice')}
        </p>
      )}

      {/* E. Soft failure note — shown when some groups errored after scan end */}
      {errorCount > 0 && (search.step === 'complete' || search.step === 'stopped') && (
        <p className="text-label text-muted-foreground">
          {t('search.failedN', { count: errorCount })}
        </p>
      )}

      {/* F. Empty state — shown when scan finished with no results */}
      {search.step === 'complete' && candidates.length === 0 && (
        <div className="px-4 py-8 flex flex-col gap-1">
          <span className="text-label font-semibold">
            {t('search.emptyHeading', { query: lastQuery, n: totalGroups })}
          </span>
          <span className="text-body text-muted-foreground">
            {t('search.emptyBody')}
          </span>
        </div>
      )}

      {/* G. Error state — shown when search failed terminally */}
      {search.step === 'error' && (
        <p className="text-label text-destructive">
          {t(`searchError.${search.code}`)}
        </p>
      )}
    </div>
  )
}

export default CandidateList

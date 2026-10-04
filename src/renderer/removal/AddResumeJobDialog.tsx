// On-launch Resume / Discard dialog for incomplete add jobs.
// Mirrors TagResumeJobDialog.tsx exactly (D-21) — add namespace, variant=default for resume
// (add is non-destructive, same as tag), addActions.startAdd instead of tagActions.startTag.
// CR-04: onOpenChange wired to no-op — Escape/backdrop must NOT silently discard the add job.
//
// Resume sends the WHOLE job.dialogIds (not the remaining subset): AddExecutor's continuation
// gate compares the full dialog-id set (Phase 14 D-20) and reuses prior outcomes itself.
// Resume stays disabled until groups are loaded (D-04) and the dialog closes only once a run started.

import React, { useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { useTranslation } from 'react-i18next'
import type { AddJobFileSafe } from '@shared/addTypes'
import { addActions } from '@renderer/store/addStore'
import { countProcessedOutcomes, getResumeDialogIds } from '@shared/addResume'
import { getResumeDialogState } from './resumeDialogState'

interface AddResumeJobDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  job: AddJobFileSafe
  onResume?: () => void
  groupsLoaded: boolean
}

export function AddResumeJobDialog({
  open,
  onOpenChange,
  job,
  onResume,
  groupsLoaded,
}: AddResumeJobDialogProps): React.JSX.Element {
  const { t } = useTranslation('add')
  const processedCount = countProcessedOutcomes(job)
  const totalCount = job.dialogIds.length
  const { resumeDisabled, showLoadingHint } = getResumeDialogState(groupsLoaded)

  const handleDiscard = useCallback(() => {
    void addActions.discardJob()
    onOpenChange(false)
  }, [onOpenChange])

  const handleResume = useCallback(async () => {
    const started = await addActions.startAdd(getResumeDialogIds(job))
    if (started) {
      onOpenChange(false)
      onResume?.()
    }
  }, [job, onOpenChange, onResume])

  return (
    // CR-04: onOpenChange wired to no-op — Escape/backdrop must NOT silently discard the job.
    // The job is only discarded via the explicit "Discard job" button (handleDiscard).
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-[400px]"
        aria-labelledby="add-resume-dialog-title"
        aria-describedby="add-resume-dialog-desc"
      >
        <DialogHeader>
          <DialogTitle id="add-resume-dialog-title" className="text-heading">
            {t('resumeTitle', { name: job.targetName })}
          </DialogTitle>
          <DialogDescription id="add-resume-dialog-desc" className="text-body">
            {t('resumeBody', { x: processedCount, n: totalCount })}
          </DialogDescription>
        </DialogHeader>

        {showLoadingHint && (
          <p className="text-label text-muted-foreground">{t('resumeLoadingGroups')}</p>
        )}

        <DialogFooter className="flex-row justify-end gap-2 sm:gap-2">
          {/* Discard — autofocus (safe default — prevents accidental resume) */}
          <Button
            variant="outline"
            onClick={handleDiscard}
            autoFocus
          >
            {t('resumeNeutral')}
          </Button>

          {/* Resume adding — variant=default (add is non-destructive per D-21) */}
          <Button
            variant="default"
            onClick={() => void handleResume()}
            disabled={resumeDisabled}
            aria-label={t('resumeDestructiveAria')}
          >
            {t('resumeDestructive')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

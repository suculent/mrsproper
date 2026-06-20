// On-launch Resume / Discard dialog for incomplete tag jobs.
// Mirrors ResumeJobDialog.tsx exactly — tag namespace, variant=default for resume (tag is non-destructive),
// tagActions.startTag instead of removalActions.startRemoval.
// CR-04: onOpenChange wired to no-op — Escape/backdrop must NOT silently discard the tag job.

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
import type { TagJobFileSafe } from '@shared/tagTypes'
import { tagActions } from '@renderer/store/tagStore'

interface TagResumeJobDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  job: TagJobFileSafe
  onResume?: () => void
}

export function TagResumeJobDialog({
  open,
  onOpenChange,
  job,
  onResume,
}: TagResumeJobDialogProps): React.JSX.Element {
  const { t } = useTranslation('tag')
  const processedCount = job.outcomes.length
  const totalCount = job.dialogIds.length

  // Remaining dialog IDs = those not yet in outcomes (unprocessed groups)
  const remainingDialogIds = job.dialogIds.filter(
    (id) => !job.outcomes.find((o) => o.dialogId === id)
  )

  const handleDiscard = useCallback(() => {
    void tagActions.discardJob()
    onOpenChange(false)
  }, [onOpenChange])

  const handleResume = useCallback(() => {
    void tagActions.startTag(job.tag, remainingDialogIds)
    onOpenChange(false)
    onResume?.()
  }, [job.tag, remainingDialogIds, onOpenChange, onResume])

  return (
    // CR-04: onOpenChange wired to no-op — Escape/backdrop must NOT silently discard the job.
    // The job is only discarded via the explicit "Discard job" button (handleDiscard).
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-[400px]"
        aria-labelledby="tag-resume-dialog-title"
        aria-describedby="tag-resume-dialog-desc"
      >
        <DialogHeader>
          <DialogTitle id="tag-resume-dialog-title" className="text-heading">
            {t('resumeTitle', { name: job.targetName })}
          </DialogTitle>
          <DialogDescription id="tag-resume-dialog-desc" className="text-body">
            {t('resumeBody', { x: processedCount, n: totalCount })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-row justify-end gap-2 sm:gap-2">
          {/* Discard — autofocus (safe default — prevents accidental resume) */}
          <Button
            variant="outline"
            onClick={handleDiscard}
            autoFocus
          >
            {t('resumeNeutral')}
          </Button>

          {/* Resume tagging — variant=default (tag is non-destructive per UI-SPEC S-6) */}
          <Button
            variant="default"
            onClick={handleResume}
            aria-label={t('resumeDestructiveAria')}
          >
            {t('resumeDestructive')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

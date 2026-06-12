// On-launch Resume / Discard dialog for incomplete removal jobs.
// LogoutDialog analog: Dialog sm:max-w-[400px]; shows target name + processed/total counts.
// "Discard job" (outline, autofocus — safe default) + "Resume removal" (destructive).
// No silent auto-resume for a destructive action (CONTEXT locked decision).

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
import type { RemovalJobFile } from '@shared/removalTypes'
import { removalActions } from '@renderer/store/removalStore'
import { removalCopy } from './removalCopy'

interface ResumeJobDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  job: RemovalJobFile
}

export function ResumeJobDialog({
  open,
  onOpenChange,
  job,
}: ResumeJobDialogProps): React.JSX.Element {
  const processedCount = job.outcomes.length
  const totalCount = job.dialogIds.length

  // Remaining dialog IDs = those not yet in outcomes (unprocessed groups)
  const remainingDialogIds = job.dialogIds.filter(
    (id) => !job.outcomes.find((o) => o.dialogId === id)
  )

  const handleDiscard = useCallback(() => {
    void removalActions.discardJob()
    onOpenChange(false)
  }, [onOpenChange])

  const handleResume = useCallback(() => {
    void removalActions.startRemoval(job.severity, remainingDialogIds)
    onOpenChange(false)
  }, [job.severity, remainingDialogIds, onOpenChange])

  return (
    // CR-04: onOpenChange wired to no-op — Escape/backdrop must NOT silently discard the job.
    // The job is only discarded via the explicit "Discard job" button (handleDiscard).
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-[400px]"
        aria-labelledby="resume-dialog-title"
        aria-describedby="resume-dialog-desc"
      >
        <DialogHeader>
          <DialogTitle id="resume-dialog-title" className="text-heading">
            {removalCopy.resumeTitle(job.targetName)}
          </DialogTitle>
          <DialogDescription id="resume-dialog-desc" className="text-body">
            {removalCopy.resumeBody(processedCount, totalCount)}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-row justify-end gap-2 sm:gap-2">
          {/* Discard — autofocus (D-15: safe default) */}
          <Button
            variant="outline"
            onClick={handleDiscard}
            autoFocus
          >
            {removalCopy.resumeNeutral}
          </Button>

          {/* Resume removal — destructive */}
          <Button
            variant="destructive"
            onClick={handleResume}
            aria-label="Resume removal job"
          >
            {removalCopy.resumeDestructive}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Pure resume helpers shared by the renderer store and the cross-process resume test.
 *
 * D-01: a resume always sends the FULL job.dialogIds set (main's continuation gate requires
 * sameDialogIdSet). D-02: 'skipped' outcomes mark groups never attempted, so they do not
 * count as processed and are eligible for reprocessing.
 */
interface ResumeJobLike {
  dialogIds: string[]
  outcomes: Array<{ dialogId: string; status: string }>
}

/** Number of outcomes that represent a group actually attempted (excludes 'skipped'). */
export function countProcessedOutcomes(job: ResumeJobLike): number {
  return job.outcomes.filter((o) => o.status !== 'skipped').length
}

/** True when every dialog in the job has a non-'skipped' outcome (nothing left to resume). */
export function isJobFinished(job: ResumeJobLike): boolean {
  const finished = new Set(job.outcomes.filter((o) => o.status !== 'skipped').map((o) => o.dialogId))
  return job.dialogIds.every((id) => finished.has(id))
}

/** The dialog ids to pass to a resume start: a copy of the FULL set, never the remaining subset. */
export function getResumeDialogIds(job: ResumeJobLike): string[] {
  return [...job.dialogIds]
}

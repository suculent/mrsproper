import { describe, it, expect } from 'vitest'
import { getResumeDialogState } from './resumeDialogState'

describe('getResumeDialogState', () => {
  it('disables Resume and shows the loading hint when groups are not loaded', () => {
    expect(getResumeDialogState(false)).toEqual({ resumeDisabled: true, showLoadingHint: true })
  })
  it('enables Resume and hides the hint when groups are loaded', () => {
    expect(getResumeDialogState(true)).toEqual({ resumeDisabled: false, showLoadingHint: false })
  })
})

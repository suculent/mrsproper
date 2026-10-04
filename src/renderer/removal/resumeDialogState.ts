// Pure gate for the Add resume dialog (D-04): Resume stays disabled, with a hint, until the
// groups enumeration has loaded (main needs the dialog map to validate the full dialog set).
export function getResumeDialogState(groupsLoaded: boolean): {
  resumeDisabled: boolean
  showLoadingHint: boolean
} {
  return { resumeDisabled: !groupsLoaded, showLoadingHint: !groupsLoaded }
}

// Wave 0 stub — will import computePlannedActions from './ReviewScreen' once Plan 03 creates it.

import { describe, it } from 'vitest'

describe('computePlannedActions — actionable filter (SAF-01)', () => {
  it.todo('returns only canAct dialogs from checkedIds (SAF-01 actionable filter)')
  it.todo('excludes dialogs where canAct is false (SAF-01 no-rights excluded)')
  it.todo('produces empty array when checkedIds is empty (SAF-01 edge)')
})

describe('computePlannedActions — SAF-02/SAF-03 combined', () => {
  it.todo('returns only canAct dialogs from checkedIds (SAF-01 actionable filter)')
  it.todo('excludes dialogs where canAct is false (SAF-01 no-rights excluded)')
})

describe('computePlannedActions — mechanic derivation (SAF-03)', () => {
  it.todo('editBanned mechanic for supergroup + ban (SAF-03)')
  it.todo('restrict-then-unban mechanic for supergroup + kick (SAF-03)')
  it.todo('deleteChatUser mechanic for basic-group + kick (SAF-03)')
  it.todo('deleteChatUser mechanic for basic-group + ban with rejoin-cant-be-blocked warning (SAF-03)')
})

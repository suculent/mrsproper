# Requirements: MrProper — v1.7 Add Mode

**Defined:** 2026-10-03
**Core Value:** A group admin can confidently remove the right person from every relevant community in one safe, verified pass — without tripping Telegram's rate limits or hitting the wrong account. v1.7 extends this to the inverse operation: adding a verified person to every selected community in one safe pass.

## v1 Requirements

Requirements for milestone v1.7. Each maps to roadmap phases.

### Mode & Checklist

- [ ] **ADD-01**: User can switch the groups pane between Remove, Tag and Add modes before the checklist is reviewed; the chosen mode determines which actions the review screen offers (Kick/Ban under Remove, Tag under Tag, Add under Add) and switching mode resets the checklist selection
- [ ] **ADD-02**: In Add mode the checklist inverts: groups the target is NOT a member of are actionable and pre-checked; groups they are already in, and groups where the admin lacks the invite right, are greyed with a cause-specific reason
- [ ] **ADD-03**: Broadcast channels are actionable in Add mode when the admin holds the invite right (Remove mode keeps them greyed as today)
- [ ] **ADD-04**: Each enumerated dialog carries a `canAdd` flag computed in the main process (creator, or `inviteUsers` admin right, or default permissions allowing invites); the renderer never derives rights itself

### Contacts

- [ ] **ADD-05**: While Add mode is active the target card shows a pre-checked "Add to contacts" / "Přidat do kontaktů" checkbox; on target confirmation the target is added to the admin's Telegram contacts if not already one; unchecked means skip, and the privacy fallback then goes straight to invite links

### Execution

- [ ] **ADD-06**: User can add the target to each selected group as a throttled, sequential run through the shared governor (`channels.InviteToChannel` for supergroups/channels, `messages.AddChatUser` for basic groups): FLOOD_WAIT honored with countdown, PEER_FLOOD hard-stops the run, ~3 s pacing between groups
- [ ] **ADD-07**: If the target is currently banned in a group, the run lifts the ban first, then invites
- [ ] **ADD-08**: Every group outcome is checkpointed to `add-job.json` as it happens; on relaunch an incomplete add job offers Resume / Discard, and a stopped or hard-stopped run can be resumed
- [ ] **ADD-09**: Per-group outcomes are typed: `done`, `already-member`, `privacy-blocked`, `failed` with a code (no rights, not mutual contact, target in too many channels, previously kicked, deleted account or bot, channel at the direct-add cap, network, unknown) and `skipped`

### Privacy fallback

- [ ] **ADD-10**: For each privacy-blocked group the run exports a unique invite link limited to one use and expiring 5 days after creation
- [ ] **ADD-11**: At run end all generated links are sent to the target in ONE direct message; a message refused by the target's privacy settings is reported as such with the links shown so the admin can pass them along another way
- [ ] **ADD-12**: The review screen shows the add consequence line, the exact group list, and the exact direct-message text that would be sent, and requires one explicit confirmation before any write; target identity is sourced from the main process only
- [ ] **ADD-16**: User can edit the direct-message template used for the invite-link message (default template provided in English and Czech, placeholders for the target's name and the link list); the template is persisted across runs and the rendered message is what ADD-12 previews

### Reporting & Log

- [ ] **ADD-13**: Live per-group progress during an add run and a per-group results report afterwards, reusing the run/report UI, with retry per failed group
- [ ] **ADD-14**: An add log records one entry per added user (timestamp, user id and display name, groups added, and the invite links generated for them), stored next to the job files with owner-only permissions, and exportable as a plain-text file through a save dialog from the app

### Localization

- [ ] **ADD-15**: All new UI strings exist in English and Czech (formal vykání, 3-form plurals) via the existing i18next namespaces

### Tag cleanup

- [ ] **TAG-07**: TagExecutor no longer performs two-phase layer isolation or `restoreMainClientLayer`; stale layer-224 comments are removed; existing tag behaviour and tests are unchanged

## v2 Requirements

Deferred to a future release. Tracked but not in the current roadmap.

### Tags

- **TAG-08**: Read back and display the target's existing tag per group (now readable at layer 229)
- **TAG-09**: Clear-tag action

### Add Mode

- **ADD-17**: Bulk mode: add several targets in one run

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Sending any direct message other than the invite-link message | Keeps the tool a membership tool, not a messaging tool; limits spam exposure of the admin account |
| Removing the target from contacts after the run | User decision: the contact stays; silent contact churn is confusing and costs extra API calls |
| Parallel ("blast") invites | Reliably triggers PEER_FLOOD and account restrictions; sequential only |
| Adding via Bot API or invite-link scraping | Bots cannot act with the admin's authority (existing project boundary) |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ADD-01 | Phase 15 | Pending |
| ADD-02 | Phase 13 | Pending |
| ADD-03 | Phase 13 | Pending |
| ADD-04 | Phase 13 | Pending |
| ADD-05 | Phase 15 | Pending |
| ADD-06 | Phase 14 | Pending |
| ADD-07 | Phase 14 | Pending |
| ADD-08 | Phase 14 | Pending |
| ADD-09 | Phase 14 | Pending |
| ADD-10 | Phase 14 | Pending |
| ADD-11 | Phase 14 | Pending |
| ADD-12 | Phase 15 | Pending |
| ADD-13 | Phase 15 | Pending |
| ADD-14 | Phase 15 | Pending |
| ADD-15 | Phase 15 | Pending |
| ADD-16 | Phase 15 | Pending |
| TAG-07 | Phase 13 | Pending |

**Coverage:**
- v1 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0 ✓

---
*Requirements defined: 2026-10-03*
*Last updated: 2026-10-03 — roadmap drafted: Phase 13 (Add Rights & Scan Semantics), Phase 14 (AddExecutor), Phase 15 (Renderer)*
</content>

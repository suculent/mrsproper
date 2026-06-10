# Requirements: MrProper

**Defined:** 2026-06-10
**Core Value:** A group admin can confidently remove the right person from every relevant community in one safe, verified, rate-limit-respecting pass.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Authentication & Session

- [x] **AUTH-01**: User can log in to their Telegram account via phone number + login code
- [x] **AUTH-02**: User can complete login when their account has a 2FA password
- [x] **AUTH-03**: App ships with an embedded api_id/api_hash so users need no per-user registration
- [x] **AUTH-04**: Session is persisted encrypted at rest (OS keystore-backed) so re-login isn't required each launch
- [x] **AUTH-05**: User can log out, revoking the server-side authorization and wiping the local session

### Target Resolution

- [ ] **TGT-01**: User can specify the target by username
- [ ] **TGT-02**: User can specify the target by phone number
- [ ] **TGT-03**: App resolves the target to a stable numeric user ID early and acts by that ID throughout
- [ ] **TGT-04**: App handles non-resolution gracefully with a distinct message per cause (username not found, phone not a contact, no public profile)

### Visual Verification

- [ ] **VRF-01**: App displays the target's avatar for visual confirmation
- [ ] **VRF-02**: App shows text identity (name, username, numeric ID, bio) alongside the avatar
- [ ] **VRF-03**: When no avatar is available, app shows a clear no-photo fallback plus available identity details, and allows the user to proceed

### Group Enumeration & Selection

- [ ] **GRP-01**: App lists only the groups where the target is actually a member (membership verified per group)
- [ ] **GRP-02**: Each listed group is shown as a checkbox pre-checked for removal (default = remove from all)
- [ ] **GRP-03**: User can uncheck groups to keep the target in selected groups
- [ ] **GRP-04**: Groups where the user lacks ban/kick rights are shown greyed-out with a specific reason
- [ ] **GRP-05**: App detects group type (basic group vs supergroup vs channel) to determine removal capability and the correct grey-out reason

### Removal Action

- [ ] **RMV-01**: User can choose per-run between ban (block rejoin) and kick (removable, can rejoin)
- [ ] **RMV-02**: App applies the correct removal mechanic per group type (basic group `deleteChatUser` vs supergroup/channel `editBanned`; kick = restrict-then-unban)

### Safety Gates

- [ ] **SAF-01**: Before execution, app shows a final review screen with target identity (including numeric ID) and the exact list of affected groups
- [ ] **SAF-02**: Execution requires one explicit confirmation on the review screen
- [ ] **SAF-03**: User can run a dry-run/preview that reports what would happen without performing any removal

### Execution & Rate Limiting

- [ ] **EXE-01**: All Telegram calls funnel through a single serialized, rate-limited governor (no parallel blasting)
- [ ] **EXE-02**: App honors FLOOD_WAIT by sleeping the server-specified time and resuming (never treated as a hard failure)
- [ ] **EXE-03**: App detects PEER_FLOOD distinctly and hard-stops the job (no retry), warning the user
- [ ] **EXE-04**: App shows live progress during execution
- [ ] **EXE-05**: App shows a per-group success/failure report after execution, with each group's failure isolated from the rest

### Application & Packaging

- [x] **APP-01**: App runs as a portable desktop app on macOS
- [x] **APP-02**: App runs as a portable desktop app on Windows
- [ ] **APP-03**: macOS build is code-signed and notarized and Windows build is code-signed (launches without Gatekeeper/SmartScreen blocking)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Accountability & Quality-of-Life

- **AUD-01**: Persistent audit log of removals with CSV/JSON export
- **RTY-01**: One-click retry of only the groups that failed
- **VRF-04**: Show common-groups count ("in 7 of your communities") during verification
- **RMV-03**: Optional opt-in toggle to also delete the target's recent messages per group
- **EXE-06**: Resumable/interruptible jobs as a user-facing feature (crash-safe checkpointing is built into the v1 executor regardless)

### Credential & Auth Resilience

- **CRED-01**: Remote-config kill-switch / rotation so a revoked shipped credential can be swapped without re-shipping
- **CRED-02**: Allow power users to supply their own api_id/api_hash to isolate blast radius
- **AUTH-06**: QR-code login as an alternative to phone + code
- **AUTH-07**: Multi-account switcher

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Telegram Bot API | Bots cannot enumerate the admin's groups or act with admin authority; requires the User (MTProto) API |
| Mobile app (iOS/Android) | Desktop-first; this is an admin task, not on-the-go |
| Group management beyond member removal (settings, creation, role edits) | Single-purpose cleanup tool |
| Bulk messaging, scraping, growth automation | Cleanup tool, not marketing/abuse tooling |
| "Remove everyone" / indiscriminate purge | The tool removes ONE verified target, never the whole roster |
| Acting on groups the user doesn't administer / removing people they have no rights over | The tool only does what the logged-in account is already permitted to do |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Complete |
| AUTH-02 | Phase 1 | Complete |
| AUTH-03 | Phase 1 | Complete |
| AUTH-04 | Phase 1 | Complete |
| AUTH-05 | Phase 1 | Complete |
| APP-01 | Phase 1 | Complete |
| APP-02 | Phase 1 | Complete |
| EXE-01 | Phase 2 | Pending |
| EXE-02 | Phase 2 | Pending |
| EXE-03 | Phase 2 | Pending |
| TGT-01 | Phase 3 | Pending |
| TGT-02 | Phase 3 | Pending |
| TGT-03 | Phase 3 | Pending |
| TGT-04 | Phase 3 | Pending |
| VRF-01 | Phase 3 | Pending |
| VRF-02 | Phase 3 | Pending |
| VRF-03 | Phase 3 | Pending |
| GRP-01 | Phase 4 | Pending |
| GRP-02 | Phase 4 | Pending |
| GRP-03 | Phase 4 | Pending |
| GRP-04 | Phase 4 | Pending |
| GRP-05 | Phase 4 | Pending |
| RMV-01 | Phase 5 | Pending |
| RMV-02 | Phase 5 | Pending |
| EXE-04 | Phase 5 | Pending |
| EXE-05 | Phase 5 | Pending |
| SAF-01 | Phase 6 | Pending |
| SAF-02 | Phase 6 | Pending |
| SAF-03 | Phase 6 | Pending |
| APP-03 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 28 total
- Mapped to phases: 28 ✓
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-10*
*Last updated: 2026-06-10 after roadmap creation*

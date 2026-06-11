---
phase: 04-group-enumeration-membership-rights
plan: "06"
subsystem: renderer-foundation
tags:
  - renderer
  - ipc-client
  - store
  - ui-primitives
  - group-enumeration
  - membership-scan
dependency_graph:
  requires:
    - "04-05-SUMMARY.md (preload bridge providing all 8 group/scan IPC methods)"
    - "04-02-SUMMARY.md (groupTypes.ts — GroupsState, ScanState, MembershipResultDTO types)"
  provides:
    - "src/renderer/ipc/groupsClient.ts (MrsProperApi augmentation + groupsClient wrapper)"
    - "src/renderer/store/groupsStore.ts (useGroupsStore hook + groupsActions)"
    - "src/renderer/components/ui/checkbox.tsx (Checkbox shadcn-pattern component)"
    - "src/renderer/components/ui/scroll-area.tsx (ScrollArea + ScrollBar shadcn-pattern components)"
  affects:
    - "04-07-PLAN.md (GroupRow.tsx — imports Checkbox, groupsActions)"
    - "04-08-PLAN.md (GroupsPane.tsx — imports useGroupsStore, groupsActions, ScrollArea)"
    - "04-09-PLAN.md (AppShell.tsx — imports GroupsPane)"
tech_stack:
  added:
    - "@radix-ui/react-checkbox@1.3.4"
    - "@radix-ui/react-scroll-area@1.2.11"
  patterns:
    - "MrsProperApi interface merging across multiple ipc client files (mirrors targetClient.ts)"
    - "useSyncExternalStore external store with ref-counted subscription lifecycle (mirrors targetStore.ts)"
    - "shadcn new-york forwardRef + displayName + cn() pattern (mirrors avatar.tsx)"
    - "Pre-check Set computed on scan complete: filter by status=member AND canAct (D-02/D-06)"
key_files:
  created:
    - src/renderer/ipc/groupsClient.ts
    - src/renderer/store/groupsStore.ts
    - src/renderer/components/ui/checkbox.tsx
    - src/renderer/components/ui/scroll-area.tsx
  modified:
    - package.json
    - package-lock.json
decisions:
  - "toggleGroup is a synchronous renderer-side Set mutation — zero IPC calls (D-03, T-04-10)"
  - "Pre-check fires only on scan step=complete AND groups.step=loaded — race-condition safe"
  - "groupsStore uses identical ref-counting pattern to targetStore.ts for consistent lifecycle behavior"
metrics:
  duration_minutes: 3
  completed_date: "2026-06-12"
  tasks_completed: 3
  files_modified: 6
---

# Phase 4 Plan 6: Renderer IPC Client, groupsStore, and UI Primitives Summary

Renderer foundation for group enumeration: groupsClient.ts augments MrsProperApi with 8 group/scan methods; groupsStore.ts provides useGroupsStore + groupsActions with pre-check logic and synchronous local toggle; checkbox.tsx and scroll-area.tsx wrap Radix primitives following shadcn forwardRef patterns.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install Radix packages and create groupsClient.ts | 1694266 | src/renderer/ipc/groupsClient.ts, package.json, package-lock.json |
| 2 | Create groupsStore.ts with pre-check logic and local toggle | 450c5c0 | src/renderer/store/groupsStore.ts |
| 3 | Create checkbox.tsx and scroll-area.tsx shadcn-pattern UI wrappers | d47830c | src/renderer/components/ui/checkbox.tsx, src/renderer/components/ui/scroll-area.tsx |

## What Was Built

**groupsClient.ts** (new file):
- `declare global { interface MrsProperApi { ... } }` augments the contextBridge surface with 8 group/scan methods
- `groupsClient` object with 8 thin wrapper methods delegating to `window.mrsproper.*`
- Methods: `getGroupsState`, `refreshGroups`, `onGroupsState`, `startScan`, `abortScan`, `retryScanGroup`, `getScanState`, `onScanState`
- Imports GroupsState, ScanState from @shared/groupTypes
- Mirrors targetClient.ts pattern exactly

**groupsStore.ts** (new file, ~155 lines):
- `GroupsStoreState`: `{ groups: GroupsState; scan: ScanState; checkedDialogIds: Set<string> }`
- Initial state: all fields at idle/empty
- Ref-counted subscription lifecycle: `startSubscriptions()` / `stopSubscriptions()` with `refCount` guard
- `onGroupsState` subscriber: `setState({ groups: s })` for all states
- `onScanState` subscriber: when `s.step === 'complete'` AND `groups.step === 'loaded'`, computes `checkedDialogIds` by filtering `s.results` for `status === 'member'` then filtering by `groups.dialogs.find(d => d.id === id)?.canAct` (D-02/D-06 pre-check)
- Bootstrap hydration: `groupsClient.getGroupsState()` called on first subscribe
- `useGroupsStore()`: exported hook via `useSyncExternalStore`
- `groupsActions`: `startScan`, `abortScan`, `retryScanGroup`, `refreshGroups` (async, IPC-delegating), `toggleGroup` (synchronous, renderer-only Set mutation)

**checkbox.tsx** (new file):
- `Checkbox` via `React.forwardRef` wrapping `CheckboxPrimitive.Root`
- Tailwind classes: peer h-4 w-4 shrink-0 rounded-sm border, focus-visible ring, disabled opacity, data-[state=checked] bg/text primary
- `CheckboxPrimitive.Indicator` contains `<Check className="h-4 w-4" />` from lucide-react
- `Checkbox.displayName = CheckboxPrimitive.Root.displayName`

**scroll-area.tsx** (new file):
- `ScrollArea` via `React.forwardRef` wrapping `ScrollAreaPrimitive.Root` with `relative overflow-hidden`
- Internal structure: Viewport + `<ScrollBar />` + Corner
- `ScrollBar` via `React.forwardRef` wrapping `ScrollAreaScrollbar` with `orientation` prop (default 'vertical')
- Orientation-aware sizing: vertical `w-2.5 border-l p-[1px]`, horizontal `h-2.5 border-t p-[1px]`
- `ScrollAreaThumb` with `rounded-full bg-border`
- Both `ScrollArea.displayName` and `ScrollBar.displayName` set from Radix primitives

## Verification Results

```
npm list @radix-ui/react-checkbox  → @radix-ui/react-checkbox@1.3.4
npm list @radix-ui/react-scroll-area → @radix-ui/react-scroll-area@1.2.11
npx tsc --noEmit → 0 errors (clean after all 3 tasks)
grep "toggleGroup" groupsStore.ts | grep "async" → empty (toggleGroup is synchronous)
grep -n "canAct" groupsStore.ts → line 60: .filter((id) => groups.dialogs.find((d) => d.id === id)?.canAct)
npm test → 2 failed | 150 passed (152 total) — same pre-existing AUTH-03 baseline
```

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None. All files are pure contracts, state management, and UI primitives — no data flows or UI rendering involved.

## Threat Flags

None. Per threat model:
- T-04-09: `window.mrsproper` calls in groupsClient go through the locked-down contextBridge surface — accepted.
- T-04-10: `checkedDialogIds` contains only dialog IDs (bigint strings), renderer-only state, never sent to main without IPC validation — accepted.

## Self-Check: PASSED

Files created:
- FOUND: src/renderer/ipc/groupsClient.ts
- FOUND: src/renderer/store/groupsStore.ts
- FOUND: src/renderer/components/ui/checkbox.tsx
- FOUND: src/renderer/components/ui/scroll-area.tsx

Commits verified:
- FOUND: 1694266 (Task 1 — Radix packages + groupsClient.ts)
- FOUND: 450c5c0 (Task 2 — groupsStore.ts)
- FOUND: d47830c (Task 3 — checkbox.tsx + scroll-area.tsx)

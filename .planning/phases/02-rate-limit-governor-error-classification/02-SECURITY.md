# Phase 2 Security Audit — Rate-Limit Governor & Error Classification

**Audit date:** 2026-06-11
**ASVS Level:** 1
**Verdict:** SECURED — 13/13 threats closed
**Audited code state:** post code-review fix pass (a693c13..7b6e2f4), current `main` at 41df5e7

Verification method: every `mitigate` disposition confirmed by direct code inspection of the
current file state (not plan/summary text). Every `accept` disposition logged below with the
in-code evidence that the accepted scope is what was declared.

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-02-01 | Information Disclosure | mitigate | CLOSED | `src/shared/opTypes.ts:50-71` — GovernorEvent union members carry only `remaining`/`seconds`/`attempt`/`maxAttempts` (numbers) and `code: OperationErrorCode` (typed literal). Zero occurrences of `errorMessage` or any raw-string field in the file. |
| T-02-02 | Tampering | mitigate | CLOSED | `src/shared/opTypes.ts:16` — `'wait'` and `'hard-stop'` are distinct literals in the Disposition union. Classifier branches on them distinctly (`operationErrors.ts:84` returns `'hard-stop'`; `:103` returns `'wait'`); governor branches `disposition === 'hard-stop'` (`governor.ts:139`) before `=== 'wait'` (`governor.ts:146`). |
| T-02-03 | Tampering | mitigate | CLOSED | `src/main/telegram/operationErrors.ts:83-85` — exact-match `errorMessage === 'PEER_FLOOD'` returns hard-stop as branch 1, BEFORE the flood-wait check at `:94-106`. PEER_FLOOD cannot reach the 'wait' path even if the error carried a `.seconds` field, because branch 1 returns first. |
| T-02-04 | Denial of Service | mitigate | CLOSED | `src/main/telegram/governor.ts:55` — `const FLOOD_CEILING_S = 3600`; `:151-154` — `seconds > FLOOD_CEILING_S` emits `wait-too-long` and throws BEFORE any sleep. Post-review hardening: `MAX_FLOOD_WAITS_PER_OP = 3` (`:66`, enforced `:158-162`) additionally bounds repeated sub-ceiling floods per operation. |
| T-02-05 | Elevation of Privilege | mitigate | CLOSED | `src/main/telegram/governor.ts:81` — `private _tail: Promise<void> = Promise.resolve()`; `:112-114` — `run()` chains `_executeWithPolicy(fn).then(resolve, reject)` onto `_tail`; the rejection is absorbed into `reject` so the tail never breaks and concurrency=1 holds for all enqueued calls. No p-queue or parallel path exists. |
| T-02-06 | Information Disclosure | mitigate | CLOSED | All five `_onEvent` emissions in `governor.ts` (`:142`, `:152`, `:160`, `:171`, `:196-200`) construct fresh object literals containing only typed `code` and numeric fields — the caught `err` object is thrown to the caller but never passed to `_onEvent`. IPC forwarding in `index.ts:159-164` sends only these typed events. |
| T-02-07 | Denial of Service | mitigate | CLOSED | `src/main/telegram/governor.ts:69` — `MAX_TRANSIENT_RETRIES = 3`; `:72` — `BACKOFF_BASE_MS = [1000, 2000, 4000]`; `:191-193` — `transientAttempts >= MAX_TRANSIENT_RETRIES` guard throws, preventing unbounded retry. |
| T-02-08 | Elevation of Privilege | mitigate | CLOSED | `src/main/telegram/SessionManager.ts:403` (getMe), `:404` (downloadProfilePhoto), `:309` (auth.LogOut invoke) — all three post-auth Telegram API calls wrapped in `this._governor.run(...)`; `grep -c "_governor.run"` = 3. Remaining direct `_client.` calls (`:177`, `:179`, `:191`, `:246`, `:329`, `:353`) are connect/disconnect/checkAuthorization/session.save — infrastructure or pre-auth, explicitly excluded by the plan. Post-review change: logout races the governed revoke against a 10s deadline (`:49`, `:315-323`) but the local wipe at `:335` remains unconditional (D-17 preserved) and the revoke still routes through the governor — no regression. |
| T-02-09 | Denial of Service | mitigate | CLOSED | `src/main/index.ts:122` — `floodSleepThreshold: 0,` in the TelegramClient constructor; exactly one occurrence, old value 5 gone; D-11 comment present (`:117-121`). |
| T-02-10 | Tampering | accept | CLOSED (accepted risk — see log below) | Code state matches the declared acceptance scope: `submitPhone`/`submitCode`/`submitPassword`/`resendCode` (`SessionManager.ts:226-292`) delegate to AuthFlow with zero `_governor` references and contain no operational API calls. |
| T-02-GC-01 | Tampering | mitigate | CLOSED | `src/main/telegram/__mocks__/telegramClient.ts:29-43` — `makeRPCError()` always sets `.errorMessage` (and `.seconds` for FLOOD_WAIT), matching the GramJS RPCError shape; LogOut branch `:137-140` throws `makeRPCError(config.logoutErrorCode)`. The plain-Error `logoutError` field no longer exists (only `logoutErrorCode?: MockRPCErrorCode` at `:72`); `SESSION_REVOKED` present in the union at `:25`. |
| T-02-GC-02 | Information Disclosure | accept | CLOSED (accepted risk — see log below) | Comment-only change verified: `opTypes.ts:14` and `:57` now correctly state SESSION_INVALID maps to 'fail'; zero occurrences of the misleading "session-invalid" hard-stop claim in `opTypes.ts` or `governor.ts`. No exported type or value changed. |
| T-02-SC | Tampering | accept | CLOSED (accepted risk — see log below) | `git log -- package.json`: the only Phase 2 commit touching it is d991d5f, whose diff adds the `typecheck` script line only — `dependencies` and `devDependencies` blocks unchanged. No new runtime packages attributable to Phase 2. |

## Accepted Risks Log

| Threat ID | Accepted Risk | Rationale | Scope Guard |
|-----------|--------------|-----------|-------------|
| T-02-10 | Interactive auth steps (submitPhone, submitCode, submitPassword, resendCode) bypass the governor per D-06. | Login is human-paced and effectively serial — not a volume flood vector. Auth-step FLOOD_WAITs are handled by the pre-existing FloodWaitController path (Phase 1), unaffected by `floodSleepThreshold=0` because AuthFlow surfaces them as countdown state. | Exception is limited to the four auth methods; any new post-auth call site must route through `governor.run()` (verify in Phase 3+ audits with `grep "_client\."` against the exclusion list above). |
| T-02-GC-02 | opTypes.ts docstring correction shipped without re-verifying renderer consumers. | Comment-only edit; no exported type, value, or runtime behavior changed. The correction removes a contract misstatement that would have misled the Phase 5 executor (expecting hard-stop for SESSION_INVALID when actual disposition is 'fail'). | None needed — documentation now matches `operationErrors.ts:110-111` ground truth. |
| T-02-SC | Supply-chain risk of Phase 2 dependency additions. | Zero new packages: governor uses a hand-rolled tail-chain instead of p-queue; classifier and types are pure TS over existing deps. | Re-verify `package.json` diff in every future phase audit. |

## Threat Flags from Summaries

- 02-01-SUMMARY: "GovernorEvent carries only typed codes... T-02-01 mitigated by design" — maps to T-02-01. Informational.
- 02-02-SUMMARY: "No new security-relevant surface... T-02-03 through T-02-07 implemented" — maps to existing IDs. Informational.
- 02-03-SUMMARY: none declared.
- 02-04-SUMMARY: "logoutErrorCode mock uses existing makeRPCError()... T-02-GC-01 mitigated" — maps to T-02-GC-01. Informational.

**Unregistered flags:** none.

**Post-summary surface (audited, mapped):** the code-review fix pass added the
`OP_GOVERNOR_EVENT` main→renderer IPC push channel (`shared/channels.ts:16`,
`index.ts:159-164`). This is new attack surface that appeared after the executor
summaries, but it falls squarely inside the trust boundary already declared by
T-02-01/T-02-06 ("GovernorEvent shapes must carry only typed codes" crossing to the
renderer). Verified: the channel transmits only governor-constructed typed event
literals; the `console.log` in main serializes the same typed payload. Not logged as
unregistered.

## Post-Fix Regression Check (per audit constraints)

| Post-fix change | Effect on register |
|-----------------|--------------------|
| `MAX_FLOOD_WAITS_PER_OP = 3` budget (governor.ts:66, 158-162) | Strengthens T-02-04/T-02-07 — bounds repeated sub-ceiling floods. No regression. |
| 10s logout revocation deadline, unconditional local wipe (SessionManager.ts:49, 306-339) | T-02-08 intact — LogOut still routes through `governor.run()` (line 309); the race only bounds how long the UI waits for `serverRevoked`. D-17 wipe unconditional. No regression. |
| Governor event IPC forwarding (index.ts:159-164) | Consistent with T-02-01/T-02-06 — typed events only. No regression. |
| Flood error shape confirmation + seconds clamping (operationErrors.ts:52-57, 94-100) | Strengthens T-02-03 — prevents SLOWMODE_WAIT-style FloodError subclasses and 0/negative waits from misclassifying as 'wait' (which would have produced a delay-free retry loop). PEER_FLOOD-first ordering unchanged. No regression. |

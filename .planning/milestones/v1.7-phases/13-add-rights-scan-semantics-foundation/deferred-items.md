# Deferred Items — Phase 13

Out-of-scope discoveries logged during execution (not fixed per the scope boundary rule).

## Plan 13-01

- `src/main/telegram/config.test.ts` — 2 pre-existing failing tests (`AUTH-03: API_ID is a
  positive integer`, `AUTH-03: API_HASH is a non-empty string`). These require
  `MRSPROPER_API_ID`/`MRSPROPER_API_HASH` env vars to be injected at test time; they are not set
  in this environment and the file is untouched by this plan. Confirmed unrelated to the
  `canAdd`/`addGreyReason` changes — out of scope, left as-is.

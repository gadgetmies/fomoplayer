# Design

## Context

See proposal.md. Railway wakes a sleeping service on the first incoming
connection; that connection is dropped (`NO_SOCKET`), and the service is
listening about 4 seconds later (container start plus model load). Node's
`fetch` reports this as `TypeError('fetch failed')` with `cause.code`
`ECONNREFUSED`.

## Goals / Non-Goals

**Goals:** an upload to a sleeping service is embedded in the same job run,
seconds later; a service that is really down still fails runs quickly.

**Non-Goals:** keeping the service awake, retrying HTTP errors, or changing
the service.

## Decisions

- **Retry only connection-level failures.** A `cause.code` of
  `ECONNREFUSED`, `ECONNRESET`, `EHOSTUNREACH`, `ENETUNREACH`, `ETIMEDOUT`,
  `EAI_AGAIN` or undici's `UND_ERR_SOCKET` means the request never reached a
  running service; anything with an HTTP status came from it and is final.
- **Waits of 1, 2, 4, 8 and 16 seconds** (31 s in all) after the first
  attempt: the first retry lands once the 4-second start is usually done, and
  the total covers a slow cold start. Injected through the job's options so
  tests run without waiting.
- **Give up for the rest of the run after one exhausted retry sequence.** The
  next samples are tried once each; later runs (every 10 minutes) start
  fresh. Alternative: stop the run outright; rejected because a single try
  per sample is cheap and keeps each sample's error in the result.

## Risks / Trade-offs

- [A run with a down service takes about 30 seconds longer] → acceptable;
  runs do not overlap (the scheduler skips a start while one runs).
- [A non-idempotent request retried] → `POST /embed` has no side effects; the
  vector is stored only after a successful answer.

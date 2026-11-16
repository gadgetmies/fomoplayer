# Design

## Context

See proposal.md. `create_server` builds a `ThreadingHTTPServer` on
`('0.0.0.0', port)`. Railway's docs: in legacy environments private DNS
resolves to IPv6 only; any IPv4 or IPv6 traffic is allowed on the network.

## Goals / Non-Goals

**Goals:** reachable from the backend over IPv6 and from Railway's health
check over IPv4; still runs on hosts and test sandboxes without IPv6.

**Non-Goals:** changing the backend URL (it stays the private hostname).

## Decisions

- **Dual-stack socket**: an `AF_INET6` server with `IPV6_V6ONLY` cleared,
  bound to `::`, accepts IPv6 and IPv4-mapped connections, so one listener
  serves both the backend and the health check. Alternative: two listeners,
  one per family; more moving parts for the same result.
- **Fallback to IPv4** when creating or binding the IPv6 socket fails (e.g.
  `EAFNOSUPPORT` in a sandbox), logged at start so the chosen address is
  visible. An explicit `host` argument is used as given (tests pass
  `127.0.0.1`).
- **Error cause in the job**: Node's `fetch` reports connection failures as
  `TypeError('fetch failed')` with the real reason in `error.cause`; append its
  `code` (or message) to the per-sample error.

## Risks / Trade-offs

- [This sandbox has no IPv6, so the dual-stack path cannot be exercised here]
  → a test covers it where IPv6 exists and skips otherwise; the fallback is
  tested by forcing the IPv6 bind to fail; the production check after deploy
  (a fresh upload embedded) is the end-to-end proof.

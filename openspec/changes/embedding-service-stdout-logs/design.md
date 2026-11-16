# Design

## Context

See proposal.md. `BaseHTTPRequestHandler.log_message` is overridden to add an
`[embedding-service]` prefix; it wrote to `sys.stderr`.

## Goals / Non-Goals

**Goals:** request lines at info level in Railway; real failures still at
error level.

**Non-Goals:** structured (JSON) logging or log levels.

## Decisions

- **`print(..., flush=True)` in `log_message`**: stdout, flushed per line so
  lines are not held in a buffer between requests. `PYTHONUNBUFFERED=1` is
  already set in the image, but flushing keeps the behaviour when the service
  runs outside it.
- **Leave `traceback.print_exc()` on stderr**: those are failures worth an
  error marker.

## Risks / Trade-offs

- [`log_error` also goes through `log_message`] → protocol errors (bad request
  lines) would land on stdout too; acceptable, the service is only reached by
  the backend on the private network.

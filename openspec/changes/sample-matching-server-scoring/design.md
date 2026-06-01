## Context

The exact-match scorer at
`packages/back/routes/admin/db.js:findExactMatchForSample` identifies
store previews that match a user's notification audio sample. Its
results are supposed to be persisted into
`user_notification_audio_sample_match` (created by migration
`20260530120000`), where the user-facing Settings page reads them as
`sample.matchCount` and the `sample:~<id>` search token uses them as
a filter. The backend write path already exists in code:
`persistSampleMatches` in `packages/back/routes/admin/db.js:843` and
a per-sample route at
`packages/back/routes/admin/api.js:283`. Neither has any caller; the
table is empty in every environment.

The analyser worker (`analyser/panako_processor.py`) is the producer
that was supposed to fill the table. Today its
`run_interleaved_scoring` calls a read-only GET endpoint per sample
and appends each result to a local `analyser/sample_match_results.jsonl`,
because the original transition plan paused on "until the persist
endpoint is deployed". The endpoint has long since landed; the worker
just never switched over.

The full design context is captured in
`docs/superpowers/specs/2026-06-01-sample-matching-server-scoring-design.md`.

## Goals / Non-Goals

**Goals:**

- End-to-end scoring: analyser → server → `user_notification_audio_sample_match`.
- One HTTP call per scoring pass instead of N (one per sample).
- Best-effort iteration: one bad sample does not poison the whole
  pass.
- No frontend changes; Settings counts and `sample:~<id>` search
  start working as a side effect.

**Non-Goals:**

- Rewriting `findExactMatchForSample` or the scoring SQL.
- Changing the `user_notification_audio_sample_match` table schema.
- Changing the scoring trigger. `--score-after N` inside the
  preview-fingerprint loop stays; only the destination changes.
- Streaming / progress reporting from the bulk endpoint.
- Server-side concurrency across samples (sequential is safer given
  current DB pressure; if scoring time becomes a problem, the
  follow-up is a worker queue, not request concurrency).
- Migrating any existing local `sample_match_results.jsonl` data
  into the DB.

## Decisions

### 1. One bulk endpoint, no per-sample persist route

`POST /api/admin/exact-match/audio-samples/matches` accepts an
optional `sample_ids` (array of ints) and an optional `threshold`.
Omitting `sample_ids` means "score every sample with fingerprints".

**Alternative considered:** Keep the existing per-sample POST and add
a separate bulk route. **Rejected** because the per-sample route has
no callers, and any caller that wants to score one sample can pass
`sample_ids: [n]` to the bulk route. Two routes doing the same job
is a maintenance tax for zero benefit.

**Alternative considered:** Bulk route only, no `sample_ids` body —
always score everything. **Rejected** because operators occasionally
want to re-score a single sample (e.g., after fixing a sample's
fingerprints), and an opt-in subset is one extra line of code.

### 2. Best-effort iteration, per-sample status in the response

Per-sample exceptions are caught, logged at `error`, and recorded as
`{ status: "error", error: <message> }` in the response. The whole
request returns 200 with `ok_count` and `fail_count`.

**Alternative considered:** Single transaction across all samples.
**Rejected** because one bad sample (e.g., a sample whose
fingerprints reference a since-deleted preview) would abort the
entire scoring pass. The current per-sample-loop worker has the same
best-effort behaviour and operators rely on it.

### 3. Sequential, not concurrent, server-side iteration

The Stage-1+Stage-2 SQL in `findExactMatchForSample` is heavy. Running
it concurrently across samples would contend on the same fingerprint
tables and likely make total wall time worse, not better.

**Alternative considered:** Bounded parallelism (e.g., concurrency of
4). **Rejected as premature**: no measurements show the sequential
loop is the bottleneck, and concurrency adds DB contention risk that
must be measured. If it ever matters, add a `concurrency` body param.

### 4. Response excludes the match arrays themselves

Response returns `match_count` and `top_score` per sample, not the
full match arrays. The matches are in
`user_notification_audio_sample_match`; round-tripping them through
HTTP just to log per-sample summaries wastes bandwidth.

**Alternative considered:** Keep the per-sample POST's response
shape, which includes the full `matches` array. **Rejected** for the
bulk case; with N samples × M matches it becomes a large payload for
information the worker only uses to print one log line.

### 5. Remove the GET sample-enumeration endpoint

`GET /api/admin/exact-match/audio-samples` was a worker-only helper.
The bulk endpoint resolves the sample list internally via the same
`queryAudioSamplesWithFingerprint` helper. The route adds no value
once the worker no longer calls it.

**Alternative considered:** Keep the endpoint for ad-hoc operator use.
**Rejected** because `fomoplayer query` (the CLI) gives operators a
better way to enumerate samples directly from the DB.

### 6. Frontend stays untouched

Search across `packages/front`, `packages/browser-extension`,
`packages/cli`, `packages/shared` shows zero callers of
`/admin/exact-match/*`. `Settings.js:1466`'s `matchCount` and the
`sample:~<id>` search token already read the match table indirectly
via `/me/notifications/audio-samples` and `/api/tracks`. They will
start returning non-zero data the moment the worker has run one
scoring pass.

### 7. New requirements live under the existing `sample-matching` capability

The capability already covers `findExactMatchForSample`, the
diagnostics endpoint, threshold-from-config, the fixture-pair
contract, and the two-stage matcher. The bulk persist endpoint is a
write-path producer for the same matcher. Adding requirements under
`sample-matching` keeps related contracts together. The archived
`suspected-sample-matches-display` capability already defines the
table and the user-facing reads; this change fills in the producer
side that was explicitly listed as "out of scope for this change"
there.

## Risks / Trade-offs

- **Long-running HTTP request.** N executions of the Stage-1+Stage-2
  SQL run sequentially inside one request. For N in the hundreds, the
  request can run for minutes. → The worker runs inside tmux under
  `analyse_all.sh` and already expects long blocks. If pointing at a
  hosted environment with a reverse proxy, the operator may need to
  widen the read timeout. Flagged in `tasks.md`.
- **Per-sample errors are swallowed at the response level.** The
  endpoint returns 200 even with `fail_count > 0`. → Operators must
  read the worker's tmux pane to notice failures. The current flow
  has the same property; mitigated by per-sample `logger.error` on
  the server.
- **Removed routes are a breaking API change.** Both removed routes
  are admin-only with no documented external integrators and no
  frontend callers. The worker switches over in the same PR. → Ship
  as one atomic deploy. Document the removal in the change's
  proposal.

## Migration Plan

This is a single atomic change. There is no staged migration:

1. Land backend (new route, two removed routes) and worker
   switchover in one PR.
2. Deploy.
3. The first time the worker runs `--score-after N`, it POSTs the
   new endpoint and starts populating the table.
4. Operators delete any stale local `analyser/sample_match_results.jsonl`
   in their checkouts (informational; no functional impact).

Rollback: revert the PR. The table contents persist (no migration
involved); the worker resumes writing to the local JSONL file. No
data loss.

## Open Questions

None outstanding.

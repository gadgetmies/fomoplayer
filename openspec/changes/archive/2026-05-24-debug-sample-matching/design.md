## Context

The audio-sample matching pipeline has three independent stages:

1. **Extraction** (Python, `analyser/panako_processor.py`,
   `extract_panako_fingerprints`): runs Panako on a downloaded audio
   file, parses the resulting `.tdb` file into `{hash, position, f1}`
   tuples, uploads them via REST.
2. **Storage** (Postgres, migrations
   `20260117215022-add-panako-fingerprints` and
   `20260125190446-add-frequency-bin-to-fingerprints`): two parallel
   tables, one for preview fingerprints and one for audio-sample
   fingerprints, both indexed on `(id)` and `(hash)`. `position` and
   `frequency_bin` are stored but no index uses them.
3. **Matching** (Postgres, `packages/back/routes/admin/db.js:507`,
   `findExactMatchForSample`): aggregates over the inner join on
   `hash`, scores by `COUNT(DISTINCT matching_hashes) /
   sample_hash_count`, filters by `threshold` (default 0.5).

A failure at any of these stages produces the same observable
symptom: "the sample doesn't match the preview." The current code
gives the operator no way to distinguish them. The fixtures in
`analyser/data/` (mantra and serious_sound) are paired specifically
to expose this — rec ↔ preview should be the easiest possible match —
and they don't.

## Goals / Non-Goals

**Goals:**

- A single command, runnable locally with no production access, that
  reports per-pair hash counts, intersection, and `Δt` histogram
  using the same extraction code as production. This isolates
  "extraction yields no overlap" from "extraction yields overlap but
  matcher discards it."
- A backend endpoint that returns the equivalent statistics for the
  rows actually in the production database. This isolates "fingerprints
  are in the DB but matcher discards them" from "fingerprints never
  reached the DB" or "fingerprints in the DB are corrupt."
- A log line per matcher invocation that names the threshold, the
  sample hash count, and the top score considered (even if filtered
  out). Lets the operator triage a missing match from the log alone.

**Non-Goals:**

- Changing the scoring algorithm. The point of this change is to make
  the failure observable. Algorithm changes belong in
  `fix-sample-matching`, whose plan is gated on the observations this
  change produces.
- Replacing Panako. The fingerprint format and library stay as-is.
- New schema or new fingerprint columns. The diagnostics work with
  what's already stored.

## Decisions

### Decision 1: Local CLI computes statistics directly from `.tdb` files

The CLI runs `extract_panako_fingerprints` from `panako_processor.py`
(the production extractor) and then computes intersection and
histograms in Python. It does *not* round-trip through the REST upload
or the database.

**Why:** the most cost-effective place to falsify "extraction works"
is locally, without a backend running. If the CLI reports zero
intersection between the rec and the preview, the matcher is not the
problem and no amount of DB or SQL inspection will help. The
diagnostics endpoint exists for the *second* question: "extraction
works locally, did the round-trip survive?"

### Decision 2: `Δt` histogram bucket of 0.05 s by default

Panako's `PANAKO_TRANSF_TIME_RESOLUTION = 2048` and
`PANAKO_SAMPLE_RATE = 11025` give a per-block duration of about
0.186 s; the existing `blocks_to_seconds` helper in
`panako_processor.py` already converts to seconds. A 0.05 s bucket is
fine-grained enough to separate spurious overlap from a real peak but
coarse enough that two genuine matches a fraction of a block apart end
up in the same bin. Bucket size is `--bucket-seconds` so an operator
can probe finer if a real peak is being smeared.

### Decision 3: "Dominant peak" defined as peak height > 3× median

We need a falsifiable, configurable signal that a pair "matches." A
flat random distribution has peak ≈ median; a real match has a tall
spike. The 3× threshold is a heuristic, not a tuned value — it exists
so the CLI can exit non-zero (and so future CI can wire this in) without
the operator having to read the histogram by eye. Configurable via
`--peak-multiplier`.

### Decision 4: Diagnostics endpoint returns *what the current scorer
would return*, not a fix

The endpoint includes `currentScorerWouldReturn` so the operator can
compare the present scoring decision with the diagnostic statistics on
the same row, side-by-side, in a single response. That is the closure
loop for "we know overlap exists, we know what the scorer thinks of
it." It does NOT include a new score from a different algorithm —
that would prejudge the fix.

### Decision 5: Endpoint is admin-only, additive

`/api/admin/exact-match/diagnostics` reuses the same authentication
middleware as the existing `/admin/exact-match/audio-samples/:sampleId/match`
endpoint (`packages/back/routes/admin/api.js:192`). No new auth
surface.

## Risks / Trade-offs

- **Risk:** the CLI requires Panako to be installed locally; the
  existing `analyser/panako_processor.py` already requires the same,
  so this is not a new constraint. Documented in the CLI's `--help`.
- **Risk:** the diagnostics endpoint loads two full fingerprint sets
  into memory to compute the intersection; for a typical preview
  (~hundreds to low thousands of hashes) this is negligible, but for
  pathological cases the endpoint should set a hard ceiling. The
  contract caps each side at 10 000 fingerprints and returns
  `{ truncated: true }` when either side is over.
- **Trade-off:** structured logging at `info` level for every match
  invocation will be noisy on a healthy production system. Acceptable
  because matching is currently invoked only via admin endpoints, not
  by user traffic; if matching ever moves onto a user-driven path the
  log should be downgraded to `debug`.

## Migration Plan

- No migration. Additive endpoint, additive Python script, additive
  log line. The follow-up `fix-sample-matching` change consumes the
  output of this one; that change's plan must cite the diagnostics
  it relied on before proposing scoring changes.

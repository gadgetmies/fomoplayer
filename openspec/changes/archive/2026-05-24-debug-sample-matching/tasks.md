## 1. Pre-flight: confirm extractor reuse and DB shape

- [x] 1.1 Re-read `analyser/panako_processor.py`
      `extract_panako_fingerprints` end-to-end and confirm it is
      importable as a module (no side-effects at import time beyond
      the OAuth helpers, which are unused when only the extractor is
      called).
      Found `sys.exit(1)` + `OpenIDConfiguration()` at module load;
      refactored to lazy `_get_oauth_client_and_provider()` so the
      module is now import-safe (AST check confirms no top-level
      side-effecting nodes).
- [x] 1.2 Re-read the schema for
      `store__track_preview_fingerprint`,
      `user_notification_audio_sample_fingerprint`, and the two
      `*_meta` tables (migrations 20260117215022 and 20260125190446).
      Confirm `hash BIGINT`, `position FLOAT`, `frequency_bin
      INTEGER`.
- [x] 1.3 Re-read `packages/back/routes/admin/db.js` lines 507–542
      (`findExactMatchForSample`) and confirm the exact column names
      used in the join, since the diagnostics query has to read the
      same rows the matcher reads.

## 2. Local CLI harness (`analyser/debug_match.py`)

- [x] 2.1 Create `analyser/debug_match.py` with an argparse front-end
      accepting `--pair A.mp3 B.mp3` (repeatable), `--data-dir
      analyser/data` (default), `--bucket-seconds 0.05`, and
      `--peak-multiplier 3.0`.
- [x] 2.2 When no `--pair` is given, run the four built-in positive
      pairs: mantra_rec ↔ mantra_preview,
      serious_sound_rec ↔ serious_sound_preview,
      serious_sound_rec ↔ serious_sound_full,
      serious_sound_full ↔ serious_sound_preview.
- [x] 2.3 For each file in a pair, call
      `panako_processor.extract_panako_fingerprints(path)` and
      collect a list of `{hash, position, f1}`.
- [x] 2.4 Compute per-file: total fingerprints, distinct-hash count,
      distinct-`(hash, f1)` count. Print to stdout as a single
      table row per file.
- [x] 2.5 Compute per-pair: hash-only intersection size, `(hash,
      f1)`-intersection size, Jaccard, containment vs the smaller
      side. Print as a single table row per pair.
- [x] 2.6 Compute per-pair: `Δt = position_preview −
      position_sample` for every matched hash, bucketed by
      `--bucket-seconds`. Print the top 10 buckets sorted by
      count.
- [x] 2.7 Exit non-zero if any *positive* pair (rec ↔ preview,
      rec ↔ full, full ↔ preview) fails to produce a peak bucket
      whose count is `--peak-multiplier × median bucket count` or
      larger. Print the failing pair(s) with peak vs median.
- [x] 2.8 Add a `--json` flag that emits machine-readable output
      (one JSON object per pair) so the script can be wired into
      automated checks later.

## 3. Backend diagnostics query

- [x] 3.1 In `packages/back/routes/admin/db.js`, add
      `queryFingerprintDiagnostics(sampleId, previewId, { bucketSeconds
      = 0.05, maxPerSide = 10000 } = {})`. The function:
      - Reads up to `maxPerSide` `(hash, position, frequency_bin)`
        rows for the sample and for the preview.
      - Returns
        `{ truncated, sampleHashCount, previewHashCount,
        intersectionHashCount, intersectionHashWithF1Count, jaccard,
        containmentAgainstSample, containmentAgainstPreview,
        topOffsetBuckets, currentScorerWouldReturn }`.
      - `currentScorerWouldReturn` is the value
        `findExactMatchForSample` would compute for this `(sample,
        preview)` pair at the supplied or default threshold.
- [x] 3.2 Use a single SQL round-trip to fetch both fingerprint sets
      (e.g. `UNION ALL` with a discriminator column) so the
      diagnostics call doesn't hammer the DB with two large queries.
- [x] 3.3 Compute intersection, Jaccard, containment, and the offset
      histogram in JavaScript on the result rows (the SQL surface is
      already complex; doing the histogram in JS keeps the query
      readable and avoids a CROSS JOIN at the DB).
- [x] 3.4 Cap the response's `topOffsetBuckets` to the top 20 by count.

## 4. Backend diagnostics route

- [x] 4.1 In `packages/back/routes/admin/api.js`, add
      `router.get('/exact-match/diagnostics', ...)` that reads
      `sampleId`, `previewId`, and optional `bucketSeconds` from the
      query string, validates them as integers/floats, and calls
      `queryFingerprintDiagnostics`. Returns the function's output as
      JSON.
- [x] 4.2 On invalid input (missing `sampleId` or `previewId`, or
      non-numeric values), return `400` with
      `{ error: 'sampleId and previewId required as integers' }`.
- [x] 4.3 On `queryFingerprintDiagnostics` throw, log via the
      shared error logger and return `500` with the error message
      (already the pattern used by neighbouring routes in
      `api.js:170-200`).

## 5. Matcher logging

- [x] 5.1 In `packages/back/routes/admin/db.js`
      `findExactMatchForSample`, after the SQL returns, emit
      `logger.info('findExactMatchForSample', { sampleId, threshold,
      sampleHashCount, candidateRowCount: rows.length,
      topScore: rows[0]?.match_score ?? null,
      topPreviewId: rows[0]?.store__track_preview_id ?? null })`.
      Compute `sampleHashCount` via a separate small query or by
      caching it from the CTE.
- [x] 5.2 Do NOT add the log to the per-row inner loop; one summary
      log per call only.

## 6. Tests

- [x] 6.1 Add `packages/back/test/tests/admin/sample-matching-diagnostics.js`
      as a cascade-test that:
      - Seeds a sample with N fingerprints and a preview with M
        fingerprints, with a known intersection K.
      - Calls `queryFingerprintDiagnostics` and asserts the returned
        counts, Jaccard, and containment match the hand-computed
        values.
      - Asserts the `topOffsetBuckets` array is non-empty when the
        seeded data contains coherent offsets, and that the peak
        bucket is the one corresponding to the seeded offset.
- [x] 6.2 Add a route-level cascade-test that mounts the admin
      router, hits `GET /api/admin/exact-match/diagnostics`, and
      asserts the JSON response shape plus the `400` and `500`
      paths.
- [x] 6.3 Add a unit test for `findExactMatchForSample`'s new log
      line: stub the logger, call the function against a small
      seeded DB, assert one and only one `info` log was emitted with
      the documented fields.

## 7. Documentation

- [x] 7.1 Add a `## Debugging sample matching` section to
      `analyser/README.md` with the `python debug_match.py` command
      and a one-line note that exit-non-zero means "extractor stage
      failed; the matcher is not the suspect."
- [x] 7.2 Add a short reference in the same section to the
      diagnostics endpoint as the round-trip-aware companion to the
      local script.

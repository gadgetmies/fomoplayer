## Why

`findExactMatchForSample` (`packages/back/routes/admin/db.js:507`) is
supposed to match a user-uploaded audio sample against the closest
store-side track preview by comparing Panako fingerprints. The known
fixture pair `analyser/data/mantra_rec.mp3` ↔ `mantra_preview.mp3` and
`serious_sound_rec.wav` ↔ `serious_sound_preview.mp3` should match — a
recording of a preview ought to be the easiest possible test case —
but in practice neither pair surfaces in the results.

We do not yet know which stage breaks:

- **Extraction:** Panako could be producing different hash sets for the
  rec and the preview (different sample rates after MP3→WAV reencode,
  Panako-version drift between processing runs, hash-format
  serialisation differences).
- **Upload / storage:** the rec or preview fingerprints could be
  missing from the database, truncated, or stored with a different
  hash encoding than what extraction produced.
- **Scoring:** fingerprint overlap could exist in the DB but the
  current SQL (raw distinct-hash overlap, threshold default 0.5)
  could be rejecting matches that any reasonable Panako-style scorer
  would accept (Panako's discriminating signal is temporal coherence
  of matched hashes, not raw bag overlap; the current SQL ignores
  the `position` column entirely and the `frequency_bin` column as
  well, even though both are stored).

Without per-stage visibility, every fix attempt is a guess that costs
a full extract → upload → match cycle to disprove. We need to see the
hash counts, the intersection, and the time-offset distribution for the
known fixture pairs before we change any scoring code.

## What Changes

- **New local CLI harness** at `analyser/debug_match.py`. Given one or
  more pairs of audio files from `analyser/data/`, it:
  - Runs Panako on each file using the same code path as
    `analyser/panako_processor.py` (`extract_panako_fingerprints`),
    so any extraction-side issue affects both this script and the
    production pipeline identically.
  - Reports per file: total fingerprints, distinct-hash count,
    distinct-`(hash, f1)` count.
  - Reports per pair: intersection size on `hash` alone and on
    `(hash, f1)`, Jaccard and containment scores, and the top 10
    buckets of the `Δt = position_preview − position_sample`
    histogram (bucket size configurable via `--bucket-seconds`,
    default `0.05`).
  - Exits non-zero when a labelled positive pair (rec ↔ preview)
    fails to produce a dominant `Δt` peak (peak height > 3× median
    bucket height), so the script can be wired into CI / a smoke
    test once the matcher is fixed.
  - Knows the four built-in positive pairs in `analyser/data/`
    (mantra_rec ↔ mantra_preview, serious_sound_rec ↔
    serious_sound_preview, serious_sound_rec ↔ serious_sound_full,
    serious_sound_full ↔ serious_sound_preview) and runs all of
    them by default.

- **New backend diagnostics endpoint**
  `GET /api/admin/exact-match/diagnostics?sampleId=&previewId=` in
  `packages/back/routes/admin/api.js`. Returns:
  ```
  {
    sampleHashCount, previewHashCount,
    intersectionHashCount, intersectionHashWithF1Count,
    jaccard, containmentAgainstSample, containmentAgainstPreview,
    topOffsetBuckets: [{ deltaTSeconds, count }, ...],
    currentScorerWouldReturn: <what findExactMatchForSample would score>
  }
  ```
  Mirrors the same statistics the CLI computes locally, but against
  the database state. Lets the operator confirm that what was
  uploaded equals what was extracted locally.

- **Structured logging on `findExactMatchForSample`**: one
  `logger.info` per invocation with `{ sampleId, threshold,
  sampleHashCount, candidateRowCount, topScore, topPreviewId }`. No
  behaviour change; lets the operator see at a glance whether the
  matcher is rejecting all candidates by threshold or whether no
  candidates exist at all.

- **No changes to the scoring algorithm in this change.** The point is
  to make the failure observable. The follow-up change
  `fix-sample-matching` (a separate proposal) consumes the
  diagnostics output to pick the right fix.

## Capabilities

### New Capabilities

- `sample-matching`: audio-sample → store-track-preview matching via
  Panako fingerprints. Covers the observability contract introduced
  by this change; subsequent changes (e.g. `fix-sample-matching`)
  extend the same capability with scoring rules.

### Modified Capabilities

None.

## Impact

- **Code**:
  - `analyser/debug_match.py` — new, ~250 lines (Panako runner reuses
    `panako_processor.extract_panako_fingerprints`; the histogram and
    reporting code is the new surface).
  - `packages/back/routes/admin/api.js` — one new route, ~25 lines.
  - `packages/back/routes/admin/db.js` — one new exported query
    (`queryFingerprintDiagnostics`), ~30 lines; one `logger.info`
    inside `findExactMatchForSample`.
- **Tests**:
  - cascade-test for the new admin route asserting the response
    shape against stubbed query rows.
  - cascade-test for `queryFingerprintDiagnostics` against the test
    database asserting intersection and histogram numbers for a
    hand-rolled fixture.
  - The `debug_match.py` script doubles as an end-to-end smoke test;
    we do not gate CI on it in this change (Panako install is not
    in CI), but we document `python analyser/debug_match.py` as the
    operator's first reach for any future regression.
- **APIs**: one new admin-only endpoint, additive. No change to
  existing endpoints.
- **DB**: read-only diagnostics; no schema change, no migration.
- **Risk**: very low. All additions; no production code paths
  changed except the addition of an info-level log inside the
  matcher.

## Why

The fixture pair `analyser/data/mantra_rec.mp3` ↔
`mantra_preview.mp3` and `serious_sound_rec.wav` ↔
`serious_sound_preview.mp3` should be the easiest possible cases for
Panako-based audio matching — a recording of the very preview the
backend has fingerprinted — and `findExactMatchForSample`
(`packages/back/routes/admin/db.js:507`) does not surface either as a
match.

The companion change `debug-sample-matching` adds the instrumentation
necessary to identify *where* the failure occurs (extraction, upload,
storage, or scoring). This change ships the targeted fix once those
diagnostics are run. The fix is intentionally not committed in
advance: depending on what the diagnostics say, the right
intervention could be any of:

1. **Encoding / extraction fix.** If the local CLI shows no
   intersection between fingerprints extracted from the rec and the
   preview, the bug is upstream — most likely a pydub MP3→WAV reencode
   parameter mismatch, a Panako-version drift, or an inconsistency
   between the analyser's two code paths
   (`main.py` audio-samples branch vs. `panako_processor.py`).
2. **Upload / storage fix.** If the local CLI shows healthy
   intersection but the diagnostics endpoint shows the DB has
   different (or zero) overlap, the bug is in the upload pipeline —
   most likely the `fp.hash || fp.hash_value || 0` falsy-coercion in
   `db.js:319-324, 395-400` silently zeroing a real hash, or a
   `BIGINT` cast losing precision for unsigned 32-bit hashes.
3. **Scoring fix.** If overlap is healthy in the DB but the matcher
   returns no rows or low-scored rows, the current SQL is the
   problem. The strongest single hypothesis: the default threshold of
   `0.5` (50% of sample hashes must appear in the preview) is far
   too aggressive for Panako-style matching, and the matcher ignores
   `position` (temporal coherence) and `frequency_bin` (Panako's
   discriminator) entirely.

The right fix is decided after `debug-sample-matching` runs, not
before. This proposal exists so that fix can land with a captured
plan, regression tests against the same fixtures, and a configuration
contract that lets the next regression be spotted via the
diagnostics from change #1.

## What Changes

The specific code changes are gated on diagnostic findings. This
proposal commits to:

- **Apply the fix indicated by `debug-sample-matching`'s diagnostics
  output.** The exact code changes are left open until the
  diagnostics have run; each of the three possible fix surfaces above
  has a sketch in `design.md`, but only one will be implemented and
  the others will be documented as "ruled out" with the diagnostics
  citation.

- **Make scoring tunables configurable, even if the fix is upstream.**
  Add `SAMPLE_MATCH_DEFAULT_THRESHOLD` and (if the fix lands a
  temporal-coherence step) `SAMPLE_MATCH_PEAK_BUCKET_MIN` env vars,
  read via `fomoplayer_shared/config`. Default values come from the
  diagnostics output (the lowest peak-bucket count observed across
  the four built-in positive pairs, divided by two). Lets the next
  operator tune without redeploying.

- **Add fixture-driven regression tests.** A cascade-test that:
  - Seeds the database with fingerprints extracted from each fixture
    pair (extracted offline; the test does not run Panako).
  - Asserts that for each positive pair (rec ↔ preview, rec ↔ full,
    full ↔ preview) `findExactMatchForSample` returns the expected
    preview at rank 1, with a score above the configured threshold.
  - Asserts that for a hand-rolled *negative* pair (rec ↔ unrelated
    preview, seeded from a different fixture) `findExactMatchForSample`
    either returns no rows or returns the unrelated preview at a
    score below the configured threshold.
  - Fixture fingerprints are checked in under
    `packages/back/test/fixtures/sample-matching/` as JSON so the test
    is hermetic and doesn't depend on Panako being installed.

- **Update `analyser/README.md`** with one paragraph naming the fix
  surface taken and the diagnostics output that justified it.

## Capabilities

### Modified Capabilities

- `sample-matching` (introduced by `debug-sample-matching`): this
  change adds requirements covering the scoring contract and the
  configuration knobs, and adds the fixture-based regression
  scenarios.

### New Capabilities

None.

## Impact

- **Code**: depends on the fix surface, but bounded as follows:
  - Encoding/extraction surface: changes in `analyser/`
    (`panako_processor.py`, possibly `main.py`) of ~20–50 lines, no
    backend code change.
  - Upload/storage surface: changes in
    `packages/back/routes/admin/db.js` `upsertPreviewFingerprints`
    and `upsertAudioSampleFingerprints` of ~10–20 lines; possibly a
    one-shot migration to re-extract the affected fingerprints, but
    only if existing rows are corrupt.
  - Scoring surface: changes in `findExactMatchForSample` of ~50–100
    lines (potentially a two-stage candidate selection +
    temporal-coherence rescoring), plus the new env-var config.
- **Tests**:
  - New: cascade-test seeded from the fixture pairs, ~100 lines.
  - Modified: any existing test that asserted the 0.5-threshold
    behaviour of `findExactMatchForSample` (one cascade-test in
    `packages/back/test/tests/admin/`, the spike's
    `findExactMatchForSample` test).
- **APIs**: no API surface change. `/api/admin/exact-match/audio-samples/:sampleId/match`
  request and response shapes stay the same; only the underlying
  scoring changes.
- **DB**: no schema change in the common case. A one-shot re-extract
  is possible if existing fingerprint rows are found to be corrupt,
  but the trigger for that decision is documented in `design.md` and
  gated on diagnostics, not assumed up front.
- **Config**:
  - `SAMPLE_MATCH_DEFAULT_THRESHOLD` (float; new): replaces the
    in-source default of `0.5`.
  - `SAMPLE_MATCH_PEAK_BUCKET_MIN` (integer; new, conditional on
    the scoring surface being chosen): minimum peak bucket count
    for a sample to count as a match under the
    temporal-coherence step.
- **Risk**: medium. Scoring changes can both fix the rec→preview gap
  and introduce regressions for previously-working matches; the
  fixture-driven regression tests bound the regression risk. Upload
  pipeline changes are higher risk because they affect every future
  fingerprint extracted; gated on the diagnostics showing the
  upload is genuinely the problem.

## Preconditions

This change MUST cite the diagnostics output from
`debug-sample-matching` in `design.md` before any task in this change
is marked complete. Specifically:

- The "Stage isolated" decision in `design.md` MUST name which of
  the three fix surfaces (extraction, upload, scoring) the
  diagnostics implicated.
- The "Ruled out" section in `design.md` MUST cite the diagnostics
  numbers (intersection counts, top-bucket counts) that rule out the
  other two surfaces.

If the diagnostics implicate more than one stage (e.g. both an upload
bug *and* a scoring bug), this proposal MUST be split into one
proposal per stage so each ships and is verified independently.

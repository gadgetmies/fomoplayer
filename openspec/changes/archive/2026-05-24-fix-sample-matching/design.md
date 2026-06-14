## Context

`findExactMatchForSample` (`packages/back/routes/admin/db.js:507`)
scores a sample against every preview by raw distinct-hash overlap
divided by sample hash count, gated by a threshold defaulting to
`0.5`. The function:

- Ignores the `position` column (no time-coherence check).
- Ignores the `frequency_bin` (`f1`) column (no Panako-style
  discriminator, even though `f1` is stored and indexed by migration
  `20260125190446`).
- Returns up to 10 candidates ordered by `(match_score DESC,
  matching_hashes DESC)`.

The fixture pairs in `analyser/data/` (mantra_rec ↔ mantra_preview,
serious_sound_rec ↔ serious_sound_preview) are designed to be
trivially matchable — a phone-style recording of the same audio the
backend has fingerprinted — and the current matcher returns no
result for either.

This design is intentionally written *before* the diagnostics from
`debug-sample-matching` have run, so it captures the decision tree
and the candidate fixes. The "Decisions" section below names which
branch the operator commits to once the diagnostics produce a
verdict.

## Goals / Non-Goals

**Goals:**

- For each of the three suspect stages (extraction, upload, scoring),
  enumerate the specific fix that would land if the diagnostics
  implicate that stage.
- For the scoring stage specifically, capture the *default*
  hypothesis — two-stage matching with temporal-coherence rescoring
  — concretely enough that the operator can implement it without
  re-deriving the algorithm.
- Lock the fix proposal to citing diagnostics output before any task
  is completed, so the architecture-vs-symptom trap (Phase 4.5 of
  systematic debugging) is avoided.

**Non-Goals:**

- Replacing Panako with a different fingerprint algorithm.
- Adding new fingerprint columns to the schema (the scoring surface
  has what it needs in `position` and `frequency_bin`).
- Reworking the analyser's OAuth or upload-batching code.

## Decisions

### Decision 0 (gating): Stage isolated — `scoring`

Captured from `python analyser/debug_match.py` against the 6 fixture
files in `analyser/data/` (mantra_full, mantra_preview, mantra_rec,
serious_sound_full, serious_sound_preview, serious_sound_rec) — all
15 unordered pairs, 2026-05-24.

**Intra-group (positive) pairs — `intersection / sample_hash_count`:**

| sample | candidate | sample h | hash ∩ | (h,f1) ∩ | ratio | peak Δt bucket |
|---|---|---:|---:|---:|---:|---|
| mantra_preview | mantra_full | 6287 | 2489 | 2432 | 0.396 | 2446 at −94.70 s |
| serious_sound_preview | serious_sound_full | 2072 | 671 | 639 | 0.324 | 215 at +13.20 s |
| serious_sound_rec | serious_sound_full | 464 | 105 | 0 | 0.226 | 11 at −46.00 s |
| serious_sound_rec | serious_sound_preview | 464 | 67 | 0 | 0.144 | 8 at −81.25 s |
| mantra_rec | mantra_full | 2686 | 317 | 284 | 0.118 | 47 at −46.65 s |
| mantra_rec | mantra_preview | 2686 | 35 | 14 | 0.013 | 3 scattered |

**Cross-group (negative) pairs — top observations:**

| sample | candidate | sample h | hash ∩ | (h,f1) ∩ | ratio |
|---|---|---:|---:|---:|---:|
| mantra_full | serious_sound_preview | 10108 | 10 | 0 | 0.001 |
| mantra_full | serious_sound_full | 10108 | 10 | 0 | 0.001 |
| serious_sound_full | mantra_full | 3416 | 10 | 0 | 0.003 |
| serious_sound_preview | mantra_preview | 2072 | 7 | 0 | 0.003 |

All other cross-group pairs: hash ∩ ≤ 2, ratio ≤ 0.0008.

**Why scoring is the load-bearing stage:**

- The lowest positive `intersection / sample_hash_count` is
  `mantra_rec ↔ mantra_preview = 0.013`; the highest cross-group ratio
  is `serious_sound_full ↔ mantra_full = 0.003`. A Stage-1 threshold
  in `[0.005, 0.01]` cleanly separates positives from negatives.
- The current in-source default `0.5` (`db.js:507`) is 38× the lowest
  positive ratio and 100×+ the negative ratios. **No real recording
  ↔ original pair can pass.** That is the user-visible bug.
- The `extraction` stage is producing recoverable signal in every
  positive case (even mantra_rec ↔ mantra_preview has 35 colliding
  hashes vs ≤ 10 for any cross-group pair). The matcher just can't
  see it through the 0.5 threshold.
- The `upload` stage is not implicated by the local CLI alone, but
  even if it were, the threshold problem dominates.

**Side findings (documented, not load-bearing for this change):**

1. **`blocks_to_seconds` was off by ~23×.** `analyser/panako_processor.py`
   used `time_resolution=2048, sample_rate=11025`; the actual Panako
   2.1 config (`~/.panako/config.properties`) is
   `PANAKO_TRANSF_TIME_RESOLUTION=128, PANAKO_SAMPLE_RATE=16000`.
   Empirically verified: max-t1 × (128/16000) matches each fixture's
   real duration within 1–10%. Fixed in this change. Existing
   production fingerprint rows have `position` values ~23× too large;
   see "Migration Plan" below.
2. **mantra_rec is a recording of mantra_full (time-stretched), not
   mantra_preview.** Original proposal mis-labelled the fixture
   relationship. Correct binding: mantra_rec → mantra_full at rank 1
   (ratio 0.118, coherent peak 47 at Δt = −46.65 s); mantra_rec →
   mantra_preview at rank 2 (ratio 0.013, scattered peaks). Both must
   surface at threshold 0.008 for the regression test.
3. **`(h, f1)` coherence is zero for every pair involving
   `serious_sound_rec.wav`.** Likely a real preprocessing asymmetry
   between pydub-converted `.mp3` inputs and direct `.wav` inputs in
   `panako_processor.py:516, 582`. Doesn't block 2C (Stage 2 stays
   hash-only per Decision 3 / 2C.3); flagged as a follow-up. Strong
   signal for (h, f1) does land for pure-mp3 pairs (95% on the
   serious_sound full↔preview control, 98% on mantra full↔preview).

**Decision 3 (scoring) selected**; Decisions 1 (extraction) and 2
(upload) ruled out by the data above. Branch 2C is the implementation
path.

### Decision 1 (conditional): Extraction-side fix

If Decision 0 says `extraction`, the surface is in `analyser/`. The
most likely root causes, in priority order:

1. **MP3→WAV reencode parameter inconsistency.** `main.py` and
   `panako_processor.py` both convert via `AudioSegment.from_mp3` and
   export as WAV, but neither specifies sample rate or channel
   count. pydub falls back to the source rate; Panako then
   re-resamples internally to `PANAKO_SAMPLE_RATE = 11025`. If the
   intermediate WAV is stereo while the original was mono (or vice
   versa) the Panako spectrum shifts. Fix: pin
   `sound.set_channels(1).set_frame_rate(44100)` before export, in
   both files.
2. **Panako-version drift between extraction runs.** If the previews
   were fingerprinted by one Panako build and the samples by
   another, their hashes won't collide even on identical audio. Fix:
   pin Panako via the `requirements.txt`'s system dependency notes
   and add a `panako --version` check at the top of
   `extract_panako_fingerprints`.
3. **`download_and_manage_file` skip-on-duplicate logic** (`panako_processor.py:144-181`)
   marks `needs_reprocess` but never actually re-extracts unless the
   downstream Panako-store call runs — which it does — but the
   delete step (`panako delete`) could fail silently, leaving a
   stale row in the Panako DB. Fix: assert on the `panako resolve`
   return after the delete-and-store cycle.

Pick whichever the diagnostics implicate; the others stay documented
as "ruled out by [diagnostic]."

### Decision 2 (conditional): Upload-side fix

If Decision 0 says `upload`, the surface is in
`packages/back/routes/admin/db.js` `upsertPreviewFingerprints` and
`upsertAudioSampleFingerprints`. The most likely root causes:

1. **`fp.hash || fp.hash_value || 0` falsy-coercion** (db.js:321,
   397). A real Panako hash of `0` is coerced to `0` here (no-op);
   *but* a string `"0"` from a misparsed `.tdb` line would be
   coerced from `"0"` (truthy) to `0` (BIGINT zero) on cast. More
   subtly, if Panako emits an unsigned 32-bit hash that wraps to
   negative on the JS side, the `|| 0` chain swallows it. Fix:
   replace the chain with an explicit `Number.isFinite(fp.hash) ?
   fp.hash : null` and reject the row if null.
2. **`BIGINT` cast losing precision.** The Python uploader sends
   hashes as JSON numbers; JSON.parse on the backend lands them as
   JS numbers, which lose precision above 2^53. Panako-32 hashes
   are well under that, but Panako has higher-precision modes; if
   one is in use, hashes silently round. Fix: send hashes as strings
   from Python (`str(hash_val)`), parse with explicit
   `BigInt`/`::BIGINT` cast on Postgres' side; the upsert SQL
   already does `rec.hash::BIGINT`, so the only change is in
   `panako_processor.py` to emit strings.

If diagnostics show the issue is corrupt existing rows (not the
incoming upload path), a one-shot migration to delete-and-re-extract
is required.

### Decision 3 (conditional): Scoring-side fix — the default hypothesis

If Decision 0 says `scoring`, the surface is `findExactMatchForSample`.
The strongest default hypothesis is a two-stage Panako-style scorer:

**Stage 1 (candidate selection):** the existing SQL, with the
threshold lowered. Default candidate threshold = the *lowest* peak
ratio observed across the four diagnostic positive pairs, divided by
two (so the production threshold is half the worst-case observed
healthy ratio). Reads `SAMPLE_MATCH_DEFAULT_THRESHOLD` from env;
falls back to a computed default from diagnostics.

**Stage 2 (temporal-coherence rescoring):** for each candidate
preview, fetch matched `(hash, position_sample, position_preview,
frequency_bin)` rows. Compute `Δt = position_preview − position_sample`
bucketed at the same `bucket-seconds` as the diagnostics endpoint
(default `0.05`). The final score is the count in the peak bucket;
rank candidates by this score, not by the raw overlap from Stage 1.

`f1` matching can be applied as a tightening filter in Stage 2 (only
count matched rows where the `f1` values also match), which boosts
precision at the cost of recall. The decision whether to use `f1`
gating is gated on diagnostics output: if the
`intersectionHashWithF1Count` is close to `intersectionHashCount` for
positive pairs, gating on `f1` is free; if it's much smaller, gating
costs too much recall and the scoring stays hash-only.

Implementation note: Stage 2 should run in SQL (CROSS JOIN on the
matched-hash rows of sample and preview, GROUP BY the bucketed `Δt`)
to avoid pulling fingerprint rows into the application. The query
plan is acceptable as long as Stage 1 has already narrowed the
preview set to a small candidate list (~10 rows).

### Decision 4: Config knobs land regardless

`SAMPLE_MATCH_DEFAULT_THRESHOLD` lands even if the fix is
extraction- or upload-side, because the in-source `0.5` was clearly
not derived from data and the next operator should be able to tune
without a redeploy. The env var is plumbed through
`fomoplayer_shared/config` and read at call time (not at module
init) so a live change in Railway env takes effect on the next
invocation.

`SAMPLE_MATCH_PEAK_BUCKET_MIN` lands only if Decision 3 is taken
(scoring-side fix with a temporal-coherence step).

### Decision 5: Regression tests use offline-extracted fingerprints

Tests cannot depend on Panako being installed in CI, so the fixture
fingerprints are extracted once and checked in under
`packages/back/test/fixtures/sample-matching/<pair>/<file>.json`. The
test loads these JSON files, seeds the DB, then runs the matcher.
Re-extracting fixtures is a manual operator step documented in
`analyser/README.md`.

## Risks / Trade-offs

- **Risk:** the diagnostics implicate two stages at once (e.g. upload
  bug *and* scoring weakness, where the scoring would surface
  matches if the upload weren't dropping rows). The proposal's
  precondition section says split into two changes; this means a
  second fix proposal lands later. Documented up-front so the cost
  is visible.
- **Risk:** the default `0.5` threshold is being used by some
  *intended* code path we haven't found. A grep of the codebase
  before tasks 1.x ships confirms no other caller; the only call
  site today is `findExactMatchForSample`'s internal default and the
  `/admin/exact-match/audio-samples/:sampleId/match` route which
  passes `threshold` from the query string.
- **Trade-off:** Stage 2 of the scoring fix does more work per
  match (a second SQL round-trip). For an admin-only diagnostic
  endpoint this is fine; if matching ever moves onto a user-driven
  path the cost needs revisiting.

## Migration Plan

- Config knobs default to behaviour-preserving values until set in
  Railway env.
- If Decision 2 implicates a corrupt-rows scenario, a one-shot
  delete-and-re-extract script runs against affected
  `(preview_id, sample_id)` rows in `packages/back/migrations/manual/`
  (not a numbered migration, since it's idempotent and operator-run).
- If Decision 3 lands, the new scoring runs against existing
  fingerprints with no schema change. Existing diagnostic output
  from `debug-sample-matching` confirms the post-fix matcher returns
  the expected fixture pairs at rank 1 before the change ships.

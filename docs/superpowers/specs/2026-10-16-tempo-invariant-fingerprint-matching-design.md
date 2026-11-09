# Tempo-invariant fingerprint matching + offline DJ set tracklists

Status: decisions taken by the agent on the user's instruction ("pick designs
you find sensible, no time to review") on 2026-10-16. Review after the fact.

## Problem

`findExactMatchForSample` Stage 2 buckets `Δt = preview_pos − sample_pos`,
which assumes the sample plays at the original tempo. DJs play tracks
±several % off (keylock time-stretch or vinyl-style speed change), so the
matched pairs smear across buckets and the peak collapses. Nothing in the
specs required tempo robustness, so it was never tested.

We also want to build a tracklist for a DJ set (tracks overlapping in
transitions) by matching it against production preview fingerprints, run
offline from the developer machine, without production service changes for
the set feature itself.

## Evidence (spike, 2026-10-15)

Fixtures stretched with `sox tempo` (keylock) and `sox speed` (vinyl) at
0, ±2, ±4, ±6, ±8 %, full track vs its preview:

- Panako hashes survive: at ±8 % 25–50 % of the shared hashes remain,
  20–40× the cross-song noise. Extraction does not need to change; no
  re-fingerprinting.
- The slope-1 Stage 2 peak collapses (369 → 36, 800 → 35).
- Searching slopes `a` in `preview_pos = a·sample_pos + b` recovers
  40–85 % of the peak; the recovered `a` equals the applied factor ±0.25 %.
  Noise peak stays ≤ 3.

## Decisions

1. **Target:** ±8 % tempo deviation, keylock and vinyl-style.
2. **No extraction change, no migration, no re-fingerprinting.**
3. **Slope-aware Stage 2** in a shared matcher module
   (`packages/back/routes/shared/db/fingerprint-matching.js`):
   - Stage 1 unchanged (distinct-hash overlap ratio ≥ threshold, top 100).
   - Stage 2 scores each candidate by the max count over
     `(a, round((p − a·s) / bucket))` for `a` in a grid over
     `[1 − D, 1 + D]`, `D = SAMPLE_MATCH_MAX_TEMPO_DEVIATION` (default 0.08).
   - Grid step `≈ bucket / span` (span = sample fingerprint time span),
     clamped to ≥ 0.0025, so drift within one hypothesis stays under one
     bucket. The grid always contains `a = 1`.
   - `D = 0` reproduces the pre-change scorer exactly (rollback switch).
   - The sample side is a parameter: a stored sample id
     (`user_notification_audio_sample_fingerprint`) or in-memory
     `hashes[]`/`positions[]` passed as arrays.
   - Rows gain `peak_tempo_factor` and `peak_offset_seconds`.
   - `findExactMatchForSample` keeps its signature and log contract and
     delegates to the shared module (plus the new fields in the log).
4. **Offline DJ set pipeline** (no production service change):
   - `analyser/fingerprint_set.py` — extracts Panako fingerprints for a long
     local audio file with the production extractor and writes JSON. URL
     inputs are downloaded with `yt-dlp` first when it is installed;
     otherwise the user passes a local file.
   - `packages/back/scripts/dj-set/tracklist.js` — slices the set into
     windows (default 30 s, hop 10 s), runs the shared matcher per window
     against the database in `DATABASE_URL` (production, read-only
     session), caches per-window results locally, and stitches detections
     into a tracklist.
   - **Overlap handling:** every window keeps *all* candidates above the
     floor, not just the top one, so two tracks playing at once both
     survive. Stitching groups detections per track by consistent
     `(a, b)` — a track playing continuously keeps the same tempo factor and
     the same global offset `b = preview_pos − a·set_pos` across windows —
     so detections of the same play chain into one segment even when its
     windows interleave with another track's windows.
   - `packages/back/scripts/dj-set/evaluate.js` — compares a tracklist with
     ground truth (per-track set intervals + acceptable production
     `track_id`s) and reports recall, precision, start-time error and tempo
     error.
   - `packages/back/scripts/dj-set/truth-from-akin.js` — builds ground truth
     from a track-feature-extractor catalog render (`set_render.timeline_snapshot`)
     and maps catalog tracks to production `track_id`s by the Beatport id in
     the file name, ISRC, then artist/title.
5. **Validation:** existing sample-matching regression tests keep passing;
   new tests cover the slope grid and stretched fixture pairs; offline
   evaluation on the S30 render(s) and on newly rendered sets from
   dj-automation with varied tempo/keylock/transitions.

## Risks

- More hypotheses → higher noise peaks. Mitigated by the regression
  negatives and by measuring precision on full sets.
- Stage 2 cost grows with the grid size (≈ 10–80 slopes). Duration is logged.
- Preview coverage: Beatport previews are ~2 min of the track; plays that
  don't overlap the preview window cannot be recognised. Evaluation reports
  which ground-truth plays overlap their preview at all.

## Implementation notes and results (2026-10-16)

Decisions taken while iterating (see `packages/back/scripts/dj-set/README.md`):

- **Set extraction in 5-minute chunks.** Panako's wrapper caps the JVM heap at
  256 MB; a 30-minute file stalls `panako delete/store`.
- **Local mirror instead of per-window production queries.** A window query
  on production spends ~18 s in random heap reads (≈1k rows/s). Both matcher
  stages only read preview rows whose hash occurs in the set, so those rows
  are copied once per set — one parallel sequential scan with a hashed
  `= ANY` filter, streamed through `psql COPY` (~5 min, read-only) — into a
  local database with production's table names, and the shared matcher runs
  there with identical results.
- **Refinement after stitching.** Window scores overlap (30 s windows, 10 s
  hop), so candidates are re-scored over their whole span on a 0.1 % tempo
  grid (whole ±8 % range): sequential offset segments at one tempo are summed
  (loops/beat jumps), clusters repeating over the same set time count once
  (shared drum breaks), tempo ties go to the tightest residual spread.
- **Acceptance by significance:** −log10 Poisson tail of the strongest segment
  against the candidate's own chance level (≥ 10); at most 3 tracks at once;
  plays sharing ≥ 20 % of a stronger overlapping play's aligned fingerprints
  are listed as alternates (remasters, DJ-mix compilation versions, remixes on
  the same audio).

Evaluation against ground truth (recall over plays whose preview overlaps the
played part by ≥ 10 s; a play counts when its track or an alternate matches):

| Set | Tempo shift | Recall | Precision | Median tempo error |
|---|---|---|---|---|
| S30 render 564 (30 tracks + 8 layers, keylock) | 0 … +7.4 % | 22/28 (79 %) | 23/25 (92 %) | 0.0005 |
| A: rows 9–20, vinyl-style @168 BPM | −3.4 … +1.8 % | 9/11 (82 %) | 10/10 (100 %) | 0.0005 |
| B: rows 9–19, keylock @183.5 BPM | +5.5 … +8.1 % | 9/11 (82 %) | 10/10 (100 %) | 0.0004 |
| C: rows 9–20, keylock + ±1 semitone @176 BPM | +1.1 … +6.7 % | 8/11 (73 %) | 9/13 (69 %) | 0.0005 |
| D: rows 9–19, vinyl-style @183.5 BPM | +5.5 … +8.1 % | 8/11 (73 %) | 8/10 (80 %) | 0.0003 |

Remaining misses are the same tracks in every render (buried under another
track for their whole preview overlap: 4–7 aligned fingerprints over 30–45 s,
at chance level) plus one +8.1 % vinyl-style play; Panako keeps about half as
many hashes under vinyl-style shifts as under keylock at the same factor.

The S30 ground truth is reconstructed from the catalog exactly as the render
made it: each layer's source cue (`src_cue_index`) is pinned to the backbone
cue plus offset, beat-locked to the backbone and audible where its authored
volume lanes are above zero (the windows agree with the desktop's compiled
envelopes to 0.1 s); tracks sound across the transition regions around them,
and beat jumps (`set_beat_jump`: Mutationz, Atlantis, Universe, Turbulence)
are mapped back to the original track positions. The S30 misses are Engram,
Tiptop, Turbulence, Snorkel, Afterglow and Universe. None of the eight layers
(six vocal stems, two whole tracks) plays inside its preview, so none is
recognisable in principle; Pendulum – Tarantula is still found (vocals over
Super Sharp Shooter, set 1572–1626 s) because the same vocal phrase recurs
inside the preview. Median anchor errors in S30 are multiples of 8 bars:
where a play overlaps its preview only in a looped intro or outro, the
strongest alignment is another repetition of the same loop.

A ±1 semitone pitch shift under keylock changes most hashes (a set of the
same audio needed 33k extra hashes mirrored), yet recall drops by one track
against the unshifted-pitch render A; precision drops more (four chance hits
at 9–26 score), so pitch-shifted sets would benefit from a stricter
significance threshold.


## Context

Primary context: `docs/superpowers/specs/2026-10-16-tempo-invariant-fingerprint-matching-design.md`
(spike numbers, decisions). Production holds ~65k fingerprinted Beatport
previews (252M rows); the hash index makes per-hash lookups cheap. Panako
hashes survive ±8 % tempo/speed shifts; only the slope-1 Stage 2 fails.

## Goals / Non-Goals

**Goals:**
- Recognise samples and DJ-set segments played up to ±8 % off tempo
  (keylock and vinyl-style) without accuracy loss.
- One matcher implementation shared by production sample matching and the
  offline DJ set tooling.
- Recognise tracks that overlap other tracks during transitions.

**Non-Goals:**
- Production endpoints, tables or UI for DJ sets.
- Changing Panako extraction or re-fingerprinting previews.
- Matching outside the preview window of a track.

## Decisions

- **Slope grid search in SQL over a JS-computed grid** (passed as
  `float8[]`). Alternatives: Hough voting on pairwise slopes (noisier on
  sparse matches), least-squares fit per candidate (needs inlier selection
  first — circular). The grid is exact, simple and bounded.
- **Grid step = clamp(bucket / span, 0.0025, D)**, symmetric around and
  always including 1.0, so short windows test ~11 slopes and long samples
  ≤ 65.
- **Sample source as a CTE fragment** (stored sample vs `unnest` arrays)
  rather than writing set fingerprints to the database — keeps the offline
  tooling read-only.
- **Windows of 30 s with 10 s hop** for sets; all candidates above the floor
  per window are kept (not top-1), which is what lets overlapping tracks
  both be detected.
- **Stitching by `(track_id, a, b)` consistency:** window detections for the
  same track whose tempo factors agree within 1 % and whose global offsets
  `b = preview_pos − a·set_pos` agree within 2 s chain into one play. A
  play is reported when its summed peak score clears a minimum; isolated
  single-window detections need a higher score than chained ones.
- **Per-window result cache** on disk keyed by a hash of the window
  fingerprints and matcher parameters, so stitching/eval re-runs never hit
  production.
- **Ground truth from the akin catalog timeline** (`startMs`, `endMs`,
  `stretch`, `startNativeMs`) mapped to production `track_id`s; the
  expected tempo factor is `1 / stretch`.

## Risks / Trade-offs

- [More slope hypotheses raise the noise peak] → keep `PEAK_BUCKET_MIN`,
  keep regression negatives, measure precision on whole sets; stitching
  rejects isolated low-score detections.
- [Stage 2 cost ×10–80 in production] → candidate count stays capped at 100;
  duration added to the summary log; `D = 0` rollback.
- [Load on production DB from offline runs] → serial window queries,
  read-only session, local cache.
- [Preview window may not overlap the played part] → evaluation reports
  which truth plays overlap their preview so recall is measured against
  what is recognisable.

## Migration Plan

No schema change. Deploy; default `D = 0.08`. Rollback by setting
`SAMPLE_MATCH_MAX_TEMPO_DEVIATION=0`.

## Open Questions

- URL ingestion (yt-dlp) for SoundCloud/Mixcloud/YouTube is supported
  opportunistically offline; productising it is out of scope.

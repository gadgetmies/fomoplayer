# DJ set tracklists (offline)

Recognises the tracks in a DJ set recording by matching its Panako
fingerprints against the preview fingerprints in the database — tempo
changes of up to ±8 % (keylock or vinyl-style) and tracks overlapping in
transitions included. Runs from a developer machine; production is only
read.

```
set audio ──analyser/fingerprint_set.py──▶ set.fps.json
                                               │
   production (read-only) ──one sequential scan per set──▶ local mirror DB
                                               │
                 tracklist.js: 30 s windows (10 s hop) × shared matcher
                     → lib/stitch.js (candidates) → lib/refine.js (plays)
                                               │
                                               ▼
                      set.tracklist.json  ──evaluate.js──▶ recall / precision
                                               ▲
          truth-from-akin.js (track-feature-extractor render timeline)
```

## Pieces

- **Matcher** — `routes/shared/db/fingerprint-matching.js`, the same code as
  production sample matching (`findExactMatchForSample`). Stage 1 picks
  previews by shared hashes, Stage 2 finds the (tempo, offset) with the most
  aligned pairs on a grid of tempo factors.
- **Local mirror** (`lib/local-mirror.js`) — both stages only read preview
  fingerprint rows whose hash occurs in the set, so those rows are copied
  into a local Postgres with production's table names and the shared matcher
  runs there with identical results. Index lookups on production are random
  heap reads (~1k rows/s); for more than 5000 hashes the mirror instead
  streams one parallel sequential scan with a hashed `= ANY(...)` filter
  through `psql COPY` (~5 min for a 30 min set). Mirrored hashes are
  remembered across runs; `--refresh-mirror` forgets them and the cached window results (do this after
  more previews have been fingerprinted).
- **Stitching** (`lib/stitch.js`) — every window keeps every candidate above
  the peak floor, so overlapping tracks are both seen. Window detections are
  chained per preview by their *anchor* (where preview 0 s falls in the set,
  `−offset / tempo`), which every window of one play agrees on even while
  another track plays over it.
- **Refinement** (`lib/refine.js`) — window scores overlap (each pair counts
  in up to three windows), so each candidate is re-scored over its whole span
  on a 0.1 % tempo grid, every set fingerprint counted once:
  - several offset clusters at one tempo count when they follow each other in
    set time (loops and beat jumps move the offset, not the clock); clusters
    covering the same set time are a loop repeating inside the preview and
    count once;
  - tempo = the sharpest peak, ties broken by the tightest residual spread;
  - **significance** = −log10 of the Poisson chance of the play's strongest
    segment given how many pairs the preview produced — previews that merely
    share a break or a sampled vocal with the set produce many pairs and so a
    high chance level;
  - a weaker play overlapping a stronger one and sharing ≥ 20 % of its aligned
    fingerprints is the same audio (remaster, DJ-mix compilation version,
    edit) and is listed as an **alternate**;
  - at most 3 tracks are accepted at any moment; a fourth is a shared sample.

## Usage

```bash
# once: local mirror database
createdb -h localhost fomoplayer-dj-set

# 1. fingerprint the set (local file, or a URL when yt-dlp is installed)
cd analyser
python3 fingerprint_set.py ~/sets/warmup.wav -o /tmp/warmup.fps.json

# 2. tracklist (DATABASE_URL = production; the session is forced read-only)
cd packages/back
DATABASE_URL="$PROD_DATABASE_URL" node scripts/dj-set/tracklist.js \
  --fingerprints=/tmp/warmup.fps.json --output=/tmp/warmup.tracklist.json

# 3. optional: ground truth from a track-feature-extractor render, and a score
DATABASE_URL="$PROD_DATABASE_URL" node scripts/dj-set/truth-from-akin.js \
  --catalog=/Volumes/DJ/AKIN/tracks.akincatalog --render-id=564 --output=/tmp/s30.truth.json
node scripts/dj-set/evaluate.js --tracklist=/tmp/warmup.tracklist.json --truth=/tmp/s30.truth.json
```

`tracklist.js --help`-style options are documented at the top of the file;
window results are cached (`~/.cache/fomoplayer-dj-set`), so re-running with
other stitching/refinement options takes seconds.

## Limits

- Only the part of a track that overlaps its preview can be recognised
  (Beatport previews are ~2 minutes; Bandcamp previews are full tracks but are
  not fingerprinted yet).
- Tracks buried under another during a long blend can leave only a handful of
  aligned fingerprints over 30–45 s — at chance level for this fingerprint
  density.
- Layers (a borrowed track or its stems over another track, `set_layer` in
  the catalog) are recognisable only where the part that plays is inside the
  preview and, for a stem layer, loud enough to survive the track under it.
  `truth-from-akin.js` reconstructs every play from the catalog the way the
  render made it — the layer's source cue pinned to the backbone cue, its
  authored volume lanes, the transition regions and beat jumps
  (`set_beat_jump`) — so the evaluation knows which part of each track
  plays. In the S30 render none of the eight layers plays inside its preview.

# Proposal

## Why

In the combined preview worker (`analyser/analyse_previews.py`) each
fingerprint process runs Panako and then uploads the fingerprints itself,
holding the preview's WAV and its in-flight slot until the upload ends.
Uploads are serialised machine-wide (`.upload_lock`) and take 2–18 s each
in production, because each fingerprint row costs a random read of the
7 GB `store__track_preview_fingerprint_hash` index (measured 2026-11-23:
98 % of the table's index reads). So the 16 in-flight slots fill with
previews waiting for their upload, and previews that only need an
embedding wait behind them; the embedding process sits idle. Between
uploads the lock is also free about 10 % of the time while all four
processes are inside Panako.

## What Changes

- The fingerprint processes return the fingerprints instead of uploading
  them. A preview's fingerprint stage is done when Panako is, so its WAV
  is deleted and its slot freed as soon as its other analyses are done.
- The coordinator uploads the returned fingerprints on one upload thread,
  in order, still under `.upload_lock`. A failed upload leaves the preview
  queued in the backend (retried after `ANALYSER_RETRY_AFTER_S`), as a
  failed fingerprint does today.
- A preview whose upload is queued or running is not fetched again.
- New `--max-queued-uploads` (default 8): no new Panako chunk starts while
  this many previews wait for their upload, so memory stays bounded when
  uploads are the bottleneck.
- New `--max-fingerprint-in-flight` (default half of `--max-in-flight`):
  previews that need a fingerprint hold at most that many slots. Otherwise
  previews waiting for Panako (paused by the queued-upload limit) fill
  every slot again, and previews needing only an embedding (8,369 of the
  16,223 left on 2026-11-23) still wait behind uploads. With the cap the
  run takes about as long as the slower of uploads (~17 h for the 7,854
  that need fingerprints) and embeddings (~22 h), not their sum.
- `panako_processor.py` is unchanged (it keeps uploading inside
  `extraction.fingerprint_prepared`).

## Impact

- Same results and the same one-upload-at-a-time load on the database;
  uploads run back to back, and embedding-only previews no longer wait
  for fingerprint uploads.

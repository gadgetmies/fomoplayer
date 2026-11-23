## Why

Every fingerprint upload writes each row into three indexes on the 66 GB
`store__track_preview_fingerprint` table. One of them,
`idx_store__track_preview_fingerprint_frequency_bin` (5.3 GB), has no
reader: no query uses the frequency bin, and production recorded no scan
since its 2026-10-28 restart. The same holds for the 408 kB sample-side index.

## What Changes

- Migration `20261123100000-drop-fingerprint-frequency-bin-indexes` drops
  both indexes (`IF EXISTS`; production already dropped them with
  `DROP INDEX CONCURRENTLY` on 2026-11-23). The columns stay.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

(none — no requirement changes; schema housekeeping)

## Impact

- `packages/back/migrations/`. Frees 5.3 GB in production and removes ~2 %
  of the index reads of each fingerprint upload.

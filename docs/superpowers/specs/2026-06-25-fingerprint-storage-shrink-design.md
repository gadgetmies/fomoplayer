# Fingerprint storage shrink

## Problem

`store__track_preview_fingerprint` and
`user_notification_audio_sample_fingerprint` are unoptimised for their volume.
Each row carries an 8-byte `*_position FLOAT8`, a 4-byte
`*_frequency_bin INTEGER`, and a per-row `*_created_at TIMESTAMPTZ` that is
strictly duplicative of the `*_extracted_at` already in the matching
`_meta` table. A `btree` index on `*_frequency_bin` exists but is never used
by any query (confirmed by codebase audit — `frequency_bin` appears only in
`SELECT … AS f1` projections, never in `WHERE`, `JOIN`, or `ORDER BY`).

Net effect: roughly 16 bytes per heap row plus a multi-GB index are spent for
no benefit.

## Goals

- Reduce the on-disk footprint of both fingerprint tables and their indexes
  without changing the matching algorithm's accuracy.
- Preserve current query latency on the load-bearing paths
  (`findExactMatchForSample` Stages 1 and 2, the per-preview/sample fetches,
  the DELETE-before-reinsert in the upsert).
- Allow rollback of the schema change without data loss for everything except
  the deliberately-dropped `*_created_at` column.

## Non-goals

- No change to the Panako analyser, the fingerprint extraction format, or
  the on-disk Panako index. Only the Postgres mirror tables change.
- No change to the matching SQL beyond narrower literal type casts in the
  upsert.
- No swap of `*_preview_id` / `*_sample_id` btree to BRIN. The per-row
  savings don't justify the clustering analysis, and the btree is hot in
  Stage 2 of matching.
- No change to the `*_fingerprint_hash` index or column type. Panako emits
  64-bit hashes; the btree is the dominant lookup index.

## Design

### Schema change per fingerprint table

Apply in a single `ALTER TABLE` so the heap is rewritten exactly once:

1. `DROP COLUMN *_fingerprint_created_at`. The `_meta` table's
   `*_extracted_at` already records the extraction time; no code consumes
   the per-row timestamp.
2. `ALTER COLUMN *_fingerprint_position TYPE real USING …::real`. Float4
   gives ~7 decimal digits → ~60 µs precision at a 600 s position, which is
   ≪ the 50 ms matching bucket (`SAMPLE_MATCH_BUCKET_SECONDS`, default
   `0.05`). Matching accuracy is unchanged.
3. `ALTER COLUMN *_fingerprint_frequency_bin TYPE smallint USING …::smallint`.
   Panako's default FFT (`size = 8192`) produces ≤ 4096 frequency bins, well
   inside smallint's 16-bit range.

Then, outside the table rewrite:

4. `DROP INDEX idx_*_fingerprint_frequency_bin`. Unused.
5. `ADD CONSTRAINT … UNIQUE
   (preview_id|sample_id, *_fingerprint_hash, *_fingerprint_position,
    *_fingerprint_frequency_bin)`.
   The current upsert is DELETE-then-INSERT, so no duplicates are expected;
   the constraint protects against regression and enables a future switch to
   `ON CONFLICT DO NOTHING` for idempotent extraction.

### Why these choices preserve performance

- The dominant lookup index `idx_*_fingerprint_hash` is left untouched —
  Stage 1 of `findExactMatchForSample`
  (`packages/back/routes/admin/db.js:725-727`) joins sample hashes into the
  preview-side hash index. Any change there would regress matching.
- The bulk-fetch index `idx_*_fingerprint_preview_id` /
  `_sample_id` is also untouched — used by Stage 2's per-candidate fetch
  (`db.js:744-746`), the diagnostics path (`db.js:592-604`), and the
  DELETE-before-reinsert (`db.js:381-384`, `db.js:457-460`).
- The new unique constraint indexes the natural row identity. It supersedes
  what the freq-bin btree was costing in disk + write amplification and is
  cheaper to maintain (one constraint vs. one btree).
- Heap shrinks per row (≈ 40 B → ≈ 24 B usable payload, accounting for
  Postgres's 8-byte alignment of the remaining `bigint, bigint, real,
  smallint` tail). More rows per 8 KB page → better cache locality on the
  hash-join inner side. This typically nets a small positive perf
  delta — never negative for the queries we run.

### Migration

In-place ALTER, accepted lock window per the migration-strategy decision.
Two `pg-migrate` migrations, one per table to bound the lock scope.

Up steps per table:

1. Guard: `DO $$ BEGIN IF (SELECT count(*) - count(DISTINCT (preview_id,
   hash, position, frequency_bin)) FROM <table>) > 0 THEN RAISE EXCEPTION
   'duplicates present, aborting'; END IF; END $$;` — fail loud before
   doing destructive work.
2. `ALTER TABLE <t>
     DROP COLUMN <t>_created_at,
     ALTER COLUMN <t>_position TYPE real USING <t>_position::real,
     ALTER COLUMN <t>_frequency_bin TYPE smallint USING <t>_frequency_bin::smallint;`
   — single ACCESS EXCLUSIVE rewrite; reclaims the dropped column's space.
3. `DROP INDEX idx_<t>_frequency_bin;`
4. `ALTER TABLE <t> ADD CONSTRAINT <t>_unique UNIQUE
     (<preview_id|sample_id>, <t>_hash, <t>_position, <t>_frequency_bin);`

Down steps per table:

1. Drop the unique constraint.
2. Recreate the freq-bin btree index.
3. `ALTER TABLE <t>
     ALTER COLUMN <t>_position TYPE double precision USING <t>_position::double precision,
     ALTER COLUMN <t>_frequency_bin TYPE integer USING <t>_frequency_bin::integer,
     ADD COLUMN <t>_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`
4. Header comment notes that `*_created_at` values are not recoverable —
   restored rows get `NOW()` as their timestamp.

### Code touchpoints

- `packages/back/migrations/2026MMDDHHMMSS-shrink-store-fingerprint.js` +
  paired up/down SQL (new).
- `packages/back/migrations/2026MMDDHHMMSS-shrink-sample-fingerprint.js` +
  paired up/down SQL (new).
- `packages/back/routes/admin/db.js`:
  - line 407 — `rec.f1::INTEGER` → `rec.f1::SMALLINT`.
  - line 406 — `rec.position::FLOAT` → `rec.position::REAL`.
  - line 483 — `rec.f1::INTEGER` → `rec.f1::SMALLINT`.
  - line 482 — `rec.position::FLOAT` → `rec.position::REAL`.
  These keep the inserts type-correct for the narrower columns. Postgres
  would implicitly widen smallint/real literals to match the column, so this
  is style, not correctness — but explicit casts are cleaner and match the
  existing pattern.

Tests in `packages/back/test/tests/admin/sample-matching-*.js` insert
integer / float literals directly. Postgres accepts these against the
narrower types unchanged; no test edits required. Confirm by running the
sample-matching test suite after the migration applies locally.

## Risk and rollback

- The ALTER TABLE rewrites take ACCESS EXCLUSIVE locks for the duration of
  the heap rewrite. Sample matching is blocked for that window. Acceptable
  per the migration-strategy decision; mitigated by running the two table
  migrations independently so each lock is scoped to one table.
- The duplicate guard makes the up migration safely abortable: if any
  duplicates exist (shouldn't, given DELETE-then-INSERT), the migration
  fails before any destructive change.
- Down migration restores types and indexes but cannot resurrect
  `*_created_at` values. This is documented and accepted: no code or
  external consumer reads them.

## Out of scope (revisit later if shrink isn't enough)

- BRIN index on `*_preview_id` / `*_sample_id` — would need a clustering
  / `CLUSTER` strategy and benchmarks against Stage 2.
- Switching the upsert path to `INSERT … ON CONFLICT DO NOTHING` now that
  a unique constraint exists. Requires a separate review of the analyser
  re-extraction semantics.
- Partitioning by `*_preview_id` range / hash for very large deployments.

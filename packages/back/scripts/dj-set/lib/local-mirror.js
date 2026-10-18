// A local Postgres mirror of the preview fingerprint rows a DJ set can match.
//
// Both matcher stages only read preview fingerprint rows whose hash occurs in
// the set, so copying exactly those rows (plus the preview → track mapping)
// lets the shared matcher run locally with identical results. Production
// fetches are the bottleneck — random heap reads on a 20+ GB table, roughly
// 5k rows/s — so every hash is fetched once and remembered; later sets only
// fetch the hashes not seen before. The tables mirror production's names and
// columns because the matcher SQL is shared.

const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const BPromise = require('bluebird')
const sql = require('sql-template-strings')
const createPool = require('pg-using-bluebird')

const SCHEMA = `
CREATE TABLE IF NOT EXISTS store__track (
  store__track_id BIGINT PRIMARY KEY,
  track_id        BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS store__track_preview (
  store__track_preview_id BIGINT PRIMARY KEY,
  store__track_id         BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS store__track_preview_fingerprint (
  store__track_preview_id                   BIGINT NOT NULL,
  store__track_preview_fingerprint_hash     BIGINT NOT NULL,
  store__track_preview_fingerprint_position FLOAT
);
CREATE INDEX IF NOT EXISTS idx_mirror_fingerprint_hash
  ON store__track_preview_fingerprint (store__track_preview_fingerprint_hash);
CREATE INDEX IF NOT EXISTS idx_mirror_fingerprint_preview_id
  ON store__track_preview_fingerprint (store__track_preview_id);
-- Hashes whose production rows have been copied, with when.
CREATE TABLE IF NOT EXISTS mirrored_hash (
  hash        BIGINT PRIMARY KEY,
  mirrored_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`

module.exports.openMirror = async (databaseUrl) => {
  const db = createPool({ dbUrl: databaseUrl, statementTimeout: '0', ssl: false })
  await db.queryAsync(SCHEMA)
  return db
}

// Forgets everything, so the next run re-fetches (e.g. after more previews
// have been fingerprinted in production).
module.exports.resetMirror = (db) =>
  db.queryAsync('TRUNCATE store__track, store__track_preview, store__track_preview_fingerprint, mirrored_hash')

const chunks = (items, size) => {
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

const insertMirroredHashes = async (mirror, hashes) => {
  for (const batch of chunks(hashes, 10000)) {
    await mirror.queryAsync(
      sql`INSERT INTO mirrored_hash (hash) SELECT unnest(${batch}::BIGINT[]) ON CONFLICT DO NOTHING`,
    )
  }
}

// Few hashes: index lookups, a batch at a time.
const fetchByIndex = async ({ source, mirror }, missing, { batchSize, concurrency, onProgress }) => {
  let done = 0
  let rowCount = 0
  await BPromise.map(
    chunks(missing, batchSize),
    async (batch) => {
      const rows = await source.queryRowsAsync(sql`-- dj-set mirror fetch
        SELECT store__track_preview_id
             , store__track_preview_fingerprint_hash::TEXT AS hash
             , store__track_preview_fingerprint_position AS position
        FROM store__track_preview_fingerprint
        WHERE store__track_preview_fingerprint_hash = ANY(${batch}::BIGINT[])`)
      await mirror.queryAsync(sql`
        INSERT INTO store__track_preview_fingerprint
          (store__track_preview_id, store__track_preview_fingerprint_hash, store__track_preview_fingerprint_position)
        SELECT * FROM unnest(${rows.map((r) => r.store__track_preview_id)}::BIGINT[],
                             ${rows.map((r) => r.hash)}::BIGINT[],
                             ${rows.map((r) => r.position)}::FLOAT8[])`)
      await insertMirroredHashes(mirror, batch)
      done += batch.length
      rowCount += rows.length
      onProgress({ done, total: missing.length, rowCount })
    },
    { concurrency },
  )
  return rowCount
}

// Many hashes: one sequential scan. Index lookups for a whole set are
// random heap reads (a hash's rows sit on the pages of every preview that
// has it) and run at ~1k rows/s; a parallel sequential scan with a hashed
// `= ANY(array)` filter reads the table once. Rows stream through psql
// `COPY` straight into the mirror, so neither side holds them in memory.
const fetchByScan = async ({ sourceUrl, mirrorUrl, mirror }, missing, { onProgress }) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dj-set-mirror-'))
  try {
    const query = path.join(dir, 'fetch.sql')
    fs.writeFileSync(
      query,
      `COPY (SELECT store__track_preview_id, store__track_preview_fingerprint_hash, store__track_preview_fingerprint_position
       FROM store__track_preview_fingerprint
       WHERE store__track_preview_fingerprint_hash = ANY('{${missing.join(',')}}'::BIGINT[])) TO STDOUT;\n`,
    )
    const startedAt = Date.now()
    // A URL `options` parameter overrides PGOPTIONS, so the session settings
    // go into the URL. Read-only is restated here, not inherited.
    const scanUrl = new URL(sourceUrl)
    scanUrl.searchParams.set(
      'options',
      '-c default_transaction_read_only=on -c enable_indexscan=off -c enable_bitmapscan=off -c statement_timeout=0',
    )
    // libpq does not decode `+` as a space (URLSearchParams encodes it so).
    const scanConnection = scanUrl.toString().replace(/\+/g, '%20')
    const producer = spawn('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-f', query, scanConnection], {
      stdio: ['ignore', 'pipe', 'inherit'],
    })
    const consumer = spawn(
      'psql',
      [
        '-X',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        '\\copy store__track_preview_fingerprint (store__track_preview_id, store__track_preview_fingerprint_hash, store__track_preview_fingerprint_position) FROM pstdin',
        mirrorUrl,
      ],
      { stdio: ['pipe', 'ignore', 'inherit'] },
    )
    let bytes = 0
    producer.stdout.on('data', (chunk) => {
      bytes += chunk.length
      onProgress({ done: 0, total: missing.length, rowCount: null, bytes, seconds: (Date.now() - startedAt) / 1000 })
    })
    producer.stdout.pipe(consumer.stdin)
    const exited = (child, name) =>
      new Promise((resolve, reject) =>
        child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${name} psql exited with ${code}`)))),
      )
    await Promise.all([exited(producer, 'production'), exited(consumer, 'mirror')])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  await insertMirroredHashes(mirror, missing)
}

// Copies production rows for every hash in `hashes` that is not mirrored yet.
module.exports.mirrorHashes = async (
  { source, mirror, sourceUrl, mirrorUrl },
  hashes,
  { batchSize = 1000, concurrency = 2, scanAbove = 5000, onProgress = () => {} } = {},
) => {
  const wanted = [...new Set(hashes.map(String))]
  const known = await mirror.queryRowsAsync(
    sql`SELECT hash::TEXT AS hash FROM mirrored_hash WHERE hash = ANY(${wanted}::BIGINT[])`,
  )
  const knownSet = new Set(known.map((r) => r.hash))
  const missing = wanted.filter((h) => !knownSet.has(h))
  // An interrupted run can leave rows of hashes it never marked mirrored.
  for (const batch of chunks(missing, 10000)) {
    await mirror.queryAsync(
      sql`DELETE FROM store__track_preview_fingerprint WHERE store__track_preview_fingerprint_hash = ANY(${batch}::BIGINT[])`,
    )
  }
  if (missing.length > scanAbove) {
    await fetchByScan({ sourceUrl, mirrorUrl, mirror }, missing, { onProgress })
  } else if (missing.length > 0) {
    await fetchByIndex({ source, mirror }, missing, { batchSize, concurrency, onProgress })
  }
  await mirrorPreviewTracks({ source, mirror })
  return { requested: wanted.length, fetched: missing.length }
}

// Copies the preview → store track → track mapping for mirrored previews.
const mirrorPreviewTracks = async ({ source, mirror }) => {
  const previews = await mirror.queryRowsAsync(sql`
    SELECT DISTINCT f.store__track_preview_id
    FROM store__track_preview_fingerprint f
    WHERE NOT EXISTS (SELECT 1 FROM store__track_preview p WHERE p.store__track_preview_id = f.store__track_preview_id)`)
  for (const batch of chunks(
    previews.map((r) => r.store__track_preview_id),
    5000,
  )) {
    const rows = await source.queryRowsAsync(sql`
      SELECT stp.store__track_preview_id, stp.store__track_id, st.track_id
      FROM store__track_preview stp NATURAL JOIN store__track st
      WHERE stp.store__track_preview_id = ANY(${batch}::BIGINT[])`)
    await mirror.queryAsync(sql`
      INSERT INTO store__track (store__track_id, track_id)
      SELECT * FROM unnest(${rows.map((r) => r.store__track_id)}::BIGINT[], ${rows.map((r) => r.track_id)}::BIGINT[])
      ON CONFLICT DO NOTHING`)
    await mirror.queryAsync(sql`
      INSERT INTO store__track_preview (store__track_preview_id, store__track_id)
      SELECT * FROM unnest(${rows.map((r) => r.store__track_preview_id)}::BIGINT[],
                           ${rows.map((r) => r.store__track_id)}::BIGINT[])
      ON CONFLICT DO NOTHING`)
  }
}

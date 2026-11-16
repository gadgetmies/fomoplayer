// A local library's Panako file store as the recogniser's fingerprint source.
//
// `build_library_db.py` (outside this repo) fingerprints every file of a music
// library with the production preview extractor into Panako FILE storage: one
// `<store>/panako_db/<resource id>.tdb` text file per track ("hash resourceId
// t1 f1" per line, t1 in 128-sample blocks at 16 kHz) with a sibling
// `<resource id>_meta_data.txt` (resource id, duration in seconds, fingerprint
// count, wav path), and a manifest `<store>/library.sqlite` mapping each
// library file path to its resource id.
//
// This module stands in for the production database: it fills the same local
// mirror tables `lib/local-mirror.js` fills from production (only the rows
// whose hash occurs in the set, so the shared matcher runs unchanged) and names
// tracks from the manifest. The resource id serves as track id, store track id
// and preview id alike, and the whole track is its one "preview" (position 0 =
// the file's start), so a truth file built from the same manifest lines up.

const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const sql = require('sql-template-strings')

const BLOCK_SECONDS = 128 / 16000

const chunks = (items, size) => {
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

const panakoDir = (storeDir) => path.join(storeDir, 'panako_db')

// Every fingerprinted track: [{ resourceId, durationSeconds, fingerprintCount }].
module.exports.libraryTracks = (storeDir) =>
  fs
    .readdirSync(panakoDir(storeDir))
    .filter((name) => name.endsWith('_meta_data.txt'))
    .map((name) => {
      const lines = fs.readFileSync(path.join(panakoDir(storeDir), name), 'utf8').split('\n')
      return { resourceId: lines[0].trim(), durationSeconds: Number(lines[1]), fingerprintCount: Number(lines[2]) }
    })

// Manifest rows for the given resource ids (or all): Map resourceId -> { path, fingerprintCount }.
module.exports.manifest = (storeDir, resourceIds) => {
  const where =
    resourceIds === undefined
      ? 'library_file_panako_resource_id IS NOT NULL'
      : `library_file_panako_resource_id IN (${resourceIds.map((id) => `'${String(id).replace(/'/g, "''")}'`).join(',')})`
  const out = execFileSync(
    'sqlite3',
    [
      '-readonly',
      '-json',
      path.join(storeDir, 'library.sqlite'),
      `SELECT library_file_path AS path, library_file_panako_resource_id AS id, library_file_fingerprint_count AS count
       FROM library_file WHERE ${where}`,
    ],
    { encoding: 'utf8', maxBuffer: 1 << 28 },
  )
  const rows = out.trim() ? JSON.parse(out) : []
  return new Map(rows.map((r) => [String(r.id), { path: r.path, fingerprintCount: r.count }]))
}

// Track names like tracklist.js shows them, from the library file name.
module.exports.libraryTrackNames = (storeDir, trackIds) => {
  if (trackIds.length === 0) return new Map()
  const rows = module.exports.manifest(storeDir, trackIds)
  return new Map(
    trackIds.map((id) => {
      const row = rows.get(String(id))
      return [Number(id), row ? path.basename(row.path, path.extname(row.path)) : `resource ${id}`]
    }),
  )
}

// Reads one .tdb file and keeps the lines whose hash is wanted.
const scanTdb = (file, wanted) => {
  const rows = []
  const text = fs.readFileSync(file, 'latin1')
  let from = 0
  while (from < text.length) {
    let to = text.indexOf('\n', from)
    if (to === -1) to = text.length
    const space = text.indexOf(' ', from)
    if (space !== -1 && space < to) {
      const hash = text.slice(from, space)
      if (wanted.has(hash)) {
        const parts = text.slice(space + 1, to).trim().split(/\s+/)
        if (parts.length >= 2) rows.push([hash, parts[0], Number(parts[1]) * BLOCK_SECONDS])
      }
    }
    from = to + 1
  }
  return rows
}

// Copies every library fingerprint row whose hash occurs in `hashes` and is not
// mirrored yet into the mirror, like `mirrorHashes` does from production.
// Returns { requested, fetched, rows, files }.
module.exports.mirrorFromLibrary = async ({ mirror, storeDir }, hashes, { onProgress = () => {} } = {}) => {
  const wanted = [...new Set(hashes.map(String))]
  const known = await mirror.queryRowsAsync(
    sql`SELECT hash::TEXT AS hash FROM mirrored_hash WHERE hash = ANY(${wanted}::BIGINT[])`,
  )
  const knownSet = new Set(known.map((r) => r.hash))
  const missing = wanted.filter((h) => !knownSet.has(h))
  for (const batch of chunks(missing, 10000)) {
    await mirror.queryAsync(
      sql`DELETE FROM store__track_preview_fingerprint WHERE store__track_preview_fingerprint_hash = ANY(${batch}::BIGINT[])`,
    )
  }
  let rowCount = 0
  const files = fs.readdirSync(panakoDir(storeDir)).filter((name) => name.endsWith('.tdb'))
  if (missing.length > 0) {
    const missingSet = new Set(missing)
    const previews = new Set()
    let pending = []
    const flush = async () => {
      if (pending.length === 0) return
      await mirror.queryAsync(sql`
        INSERT INTO store__track_preview_fingerprint
          (store__track_preview_id, store__track_preview_fingerprint_hash, store__track_preview_fingerprint_position)
        SELECT * FROM unnest(${pending.map((r) => r[1])}::BIGINT[], ${pending.map((r) => r[0])}::BIGINT[],
                             ${pending.map((r) => r[2])}::FLOAT8[])`)
      rowCount += pending.length
      pending = []
    }
    for (const [i, name] of files.entries()) {
      const rows = scanTdb(path.join(panakoDir(storeDir), name), missingSet)
      for (const row of rows) previews.add(row[1])
      pending.push(...rows)
      if (pending.length >= 20000) await flush()
      if (i % 200 === 0 || i === files.length - 1) onProgress({ done: i + 1, total: files.length, rowCount })
    }
    await flush()
    const ids = [...previews]
    for (const batch of chunks(ids, 5000)) {
      await mirror.queryAsync(sql`
        INSERT INTO store__track (store__track_id, track_id)
        SELECT id, id FROM unnest(${batch}::BIGINT[]) AS id ON CONFLICT DO NOTHING`)
      await mirror.queryAsync(sql`
        INSERT INTO store__track_preview (store__track_preview_id, store__track_id)
        SELECT id, id FROM unnest(${batch}::BIGINT[]) AS id ON CONFLICT DO NOTHING`)
    }
    for (const batch of chunks(missing, 10000)) {
      await mirror.queryAsync(
        sql`INSERT INTO mirrored_hash (hash) SELECT unnest(${batch}::BIGINT[]) ON CONFLICT DO NOTHING`,
      )
    }
  }
  return { requested: wanted.length, fetched: missing.length, rows: rowCount, files: files.length }
}

module.exports.scanTdb = scanTdb

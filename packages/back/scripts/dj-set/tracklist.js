#!/usr/bin/env node

// Builds a tracklist for a DJ set by matching its Panako fingerprints
// (analyser/fingerprint_set.py) against the preview fingerprints in the
// database, window by window, with the shared tempo-aware matcher.
//
// 1. The preview fingerprint rows sharing a hash with the set are copied
//    from DATABASE_URL (e.g. production; the session is forced read-only)
//    into a local mirror database (lib/local-mirror.js). Hashes already
//    mirrored by earlier runs are not fetched again.
// 2. Every window runs the shared matcher against the mirror, which holds
//    every row the matcher can read for this set, so results equal matching
//    against production. Every candidate above the peak floor is kept per
//    window, so tracks that overlap in a transition are both detected;
//    lib/stitch.js chains the window detections into plays. Window results
//    are cached on disk, so re-stitching does not match again.
//
// Usage:
//   createdb -h localhost fomoplayer-dj-set   # once
//   DATABASE_URL=<production url> node scripts/dj-set/tracklist.js \
//     --fingerprints=set.fps.json --output=set.tracklist.json
// Options (defaults in brackets):
//   --mirror-url=<url>            [postgres://localhost/fomoplayer-dj-set]
//   --refresh-mirror              forget mirrored rows (and cached window results) and fetch again
//   --fetch-concurrency=2         parallel production fetches
//   --window=30 --hop=10          window length and step in seconds
//   --threshold=0.008             Stage 1 distinct-hash overlap ratio
//   --peak-min=3                  Stage 2 peak floor per window
//   --max-tempo-deviation=0.08    tempo factors searched: 1 ± this
//   --bucket=0.5                  Stage 2 offset bucket in seconds
//   --cache-dir=<dir>             [~/.cache/fomoplayer-dj-set]
//   --min-windows=1, --min-single-window-score=6, --min-total-score=6,
//   --anchor-tolerance, --tempo-tolerance   candidate stitching (lib/stitch.js)
//   --min-refined-score=6, --min-significance=10, --alternate-overlap=0.2,
//   --max-concurrent=3                 refinement and selection (lib/refine.js)

const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const sql = require('sql-template-strings')
const { pg, assertReadOnly } = require('./lib/read-only-db')
const { openMirror, resetMirror, mirrorHashes } = require('./lib/local-mirror')
const { parseArgs } = require('./lib/args')
const { stitch } = require('./lib/stitch')
const { refine } = require('./lib/refine')
const { matchFingerprints } = require('../../routes/shared/db/fingerprint-matching')

const number = (value, fallback) => (value === undefined ? fallback : Number(value))

const windowsOf = (fingerprints, durationSeconds, windowSeconds, hopSeconds) => {
  const sorted = [...fingerprints].sort((a, b) => a.position - b.position)
  const windows = []
  let from = 0
  for (let start = 0; start < durationSeconds; start += hopSeconds) {
    const end = start + windowSeconds
    while (from < sorted.length && sorted[from].position < start) from++
    let to = from
    while (to < sorted.length && sorted[to].position < end) to++
    windows.push({
      startSeconds: start,
      endSeconds: Math.min(end, durationSeconds),
      fingerprints: sorted.slice(from, to),
    })
    if (end >= durationSeconds) break
  }
  return windows
}

const cacheKey = (fingerprints, matcherOptions) =>
  crypto
    .createHash('sha1')
    .update(JSON.stringify({ v: 2, matcherOptions, fps: fingerprints.map((fp) => [String(fp.hash), fp.position]) }))
    .digest('hex')

const trackNames = async (trackIds) => {
  if (trackIds.length === 0) return new Map()
  const rows = await pg.queryRowsAsync(sql`
    SELECT t.track_id, t.track_title, t.track_version
         , (SELECT string_agg(artist_name, ', ' ORDER BY artist_name)
            FROM track__artist NATURAL JOIN artist WHERE track_id = t.track_id) AS artists
    FROM track t WHERE t.track_id = ANY(${trackIds})`)
  return new Map(
    rows.map((r) => [
      Number(r.track_id),
      `${r.artists || '?'} – ${r.track_title}${r.track_version ? ` (${r.track_version})` : ''}`,
    ]),
  )
}

const timestamp = (seconds) => {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const pad = (n) => String(n).padStart(2, '0')
  return `${h > 0 ? `${h}:${pad(m)}` : m}:${pad(s % 60)}`
}

const main = async () => {
  const args = parseArgs(process.argv.slice(2))
  if (!args.fingerprints || !args.output) {
    throw new Error('usage: tracklist.js --fingerprints=<set.fps.json> --output=<tracklist.json> [options]')
  }
  const set = JSON.parse(fs.readFileSync(args.fingerprints, 'utf8'))
  const windowSeconds = number(args.window, 30)
  const hopSeconds = number(args.hop, 10)
  const matcherOptions = {
    threshold: number(args.threshold, 0.008),
    bucketSeconds: number(args.bucket, 0.5),
    peakBucketMin: number(args['peak-min'], 3),
    maxTempoDeviation: number(args['max-tempo-deviation'], 0.08),
    resultLimit: number(args['result-limit'], 20),
  }
  const cacheDir = args['cache-dir'] || path.join(os.homedir(), '.cache', 'fomoplayer-dj-set')
  fs.mkdirSync(cacheDir, { recursive: true })

  await assertReadOnly()
  const mirrorUrl = args['mirror-url'] || 'postgres://localhost/fomoplayer-dj-set'
  const mirror = await openMirror(mirrorUrl)
  if (args['refresh-mirror']) {
    await resetMirror(mirror)
    // Window results were matched against the old mirror rows.
    for (const file of fs.readdirSync(cacheDir).filter((f) => f.endsWith('.json'))) {
      fs.unlinkSync(path.join(cacheDir, file))
    }
  }
  const fetchStartedAt = Date.now()
  const mirrored = await mirrorHashes(
    { source: pg, mirror, sourceUrl: process.env.DATABASE_URL_PRIVATE || process.env.DATABASE_URL, mirrorUrl },
    set.fingerprints.map((fp) => fp.hash),
    {
      concurrency: number(args['fetch-concurrency'], 2),
      onProgress: ({ done, total, rowCount, bytes }) =>
        process.stderr.write(
          `\rmirroring ${total} hashes: ` +
            (bytes === undefined ? `${done} done, ${rowCount} rows` : `${(bytes / 1e6).toFixed(0)} MB streamed`) +
            `, ${Math.round((Date.now() - fetchStartedAt) / 1000)} s   `,
        ),
    },
  )
  process.stderr.write(`\nmirror: ${mirrored.requested} set hashes, ${mirrored.fetched} fetched now\n`)

  const windows = windowsOf(set.fingerprints, set.durationSeconds, windowSeconds, hopSeconds)
  const startedAt = Date.now()
  let queried = 0
  for (const [i, w] of windows.entries()) {
    const cacheFile = path.join(cacheDir, `${cacheKey(w.fingerprints, matcherOptions)}.json`)
    if (fs.existsSync(cacheFile)) {
      w.rows = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
    } else {
      const { rows } = await matchFingerprints(
        { hashes: w.fingerprints.map((fp) => fp.hash), positions: w.fingerprints.map((fp) => fp.position) },
        { ...matcherOptions, db: mirror },
      )
      w.rows = rows
      fs.writeFileSync(cacheFile, JSON.stringify(rows))
      queried++
    }
    process.stderr.write(
      `\rwindow ${i + 1}/${windows.length} (${timestamp(w.startSeconds)}) ` +
        `${w.fingerprints.length} fps, ${w.rows.length} candidates, ${queried} queried, ` +
        `${Math.round((Date.now() - startedAt) / 1000)} s   `,
    )
  }
  process.stderr.write('\n')

  // Stitching only proposes candidates (loose gates); refinement over each
  // candidate's whole span decides (see lib/refine.js).
  const candidates = stitch(windows, {
    minWindows: number(args['min-windows'], 1),
    minSingleWindowScore: number(args['min-single-window-score'], 6),
    minTotalScore: number(args['min-total-score'], 6),
    ...(args['anchor-tolerance'] !== undefined && { anchorToleranceSeconds: Number(args['anchor-tolerance']) }),
    ...(args['tempo-tolerance'] !== undefined && { tempoTolerance: Number(args['tempo-tolerance']) }),
  })
  const plays = await refine(mirror, set.fingerprints, candidates, {
    bucketSeconds: matcherOptions.bucketSeconds,
    maxTempoDeviation: matcherOptions.maxTempoDeviation,
    ...(args['min-refined-score'] !== undefined && { minRefinedScore: Number(args['min-refined-score']) }),
    ...(args['alternate-overlap'] !== undefined && { alternateOverlap: Number(args['alternate-overlap']) }),
    ...(args['min-significance'] !== undefined && { minSignificance: Number(args['min-significance']) }),
    ...(args['max-concurrent'] !== undefined && { maxConcurrent: Number(args['max-concurrent']) }),
  })
  process.stderr.write(`${candidates.length} candidates, ${plays.length} plays after refinement\n`)
  const names = await trackNames([...new Set(plays.flatMap((p) => [p.trackId, ...p.alternates.map((a) => a.trackId)]))])
  const tracklist = {
    source: set.source,
    durationSeconds: set.durationSeconds,
    params: { windowSeconds, hopSeconds, ...matcherOptions },
    plays: plays.map((p) => ({
      ...p,
      name: names.get(p.trackId),
      alternates: p.alternates.map((a) => ({ ...a, name: names.get(a.trackId) })),
    })),
    windows: windows.map((w) => ({ startSeconds: w.startSeconds, endSeconds: w.endSeconds, rows: w.rows })),
  }
  fs.writeFileSync(args.output, JSON.stringify(tracklist, null, 1))

  for (const p of tracklist.plays) {
    const tempo = ((p.tempoFactor - 1) * 100).toFixed(1)
    console.log(
      `${timestamp(p.startSeconds).padStart(7)}–${timestamp(p.endSeconds).padEnd(7)} ` +
        `${tempo >= 0 ? '+' : ''}${tempo}%  score ${String(p.score).padStart(4)} ` +
        `(${p.windows} win)  ${p.name} [track ${p.trackId}]` +
        (p.alternates.length ? `\n${' '.repeat(36)}also: ${p.alternates.map((a) => a.name).join('; ')}` : ''),
    )
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })

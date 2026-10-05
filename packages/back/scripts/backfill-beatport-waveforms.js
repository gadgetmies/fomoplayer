#!/usr/bin/env node

// Backfills waveform images for Beatport previews that have none.
//
// Ingestion never revisits a track once its URL is stored, so previews stored
// from a payload without a waveform image stay without one. The player then
// generates a waveform from the 120 s sample, which spans only the sample
// instead of the full track. A few previews also carry an empty-URL waveform
// row, which the player reads as "no waveform" too.
//
// This script re-fetches the affected tracks from the Beatport v4 API, takes
// the waveform image through the same transform as ingestion, attaches it to
// every preview of the store track that lacks a working waveform, removes the
// empty (or broken) rows those previews had, and refreshes track_details.
//
// It is DRY-RUN by default. Flags:
//   --apply              write the waveforms (otherwise only report)
//   --verify-existing    also GET every stored waveform URL and replace the
//                        ones that no longer load. Slow: one request per URL.
//                        (Beatport's CDN rejects HEAD, so a 1-byte GET is used.)
//   --limit=N            stop after N candidate store tracks (default: all)
//   --batch-size=N       ids per v4 request (default: 50, max 100)
//   --track-ids=1,2,3    only these (internal) track ids
//   --concurrency=N      store tracks written in parallel (default: 1)
//
// Needs the backend env (DATABASE_URL, STATEMENT_TIMEOUT, BEATPORT_USERNAME,
// BEATPORT_PASSWORD), e.g. `npx dotenv -e .env.development -- node scripts/...`.

const BPromise = require('bluebird')
const sql = require('sql-template-strings')
const pg = require('fomoplayer_shared').db.pg
const { storeUrl: STORE_URL } = require('../routes/stores/beatport/logic')
const { beatportTrackTransform } = require('fomoplayer_browser_extension/src/js/transforms/beatport')
const { refreshTrackDetails } = require('../routes/shared/db/store')
const { insertSource } = require('../jobs/watches/shared/db')
const { fetchTracks } = require('./lib/beatport-v4-fetch')

const MAX_PARALLEL_URL_CHECKS = 16

// true: loads, false: definitely gone, null: could not tell (left alone)
const checkWaveformUrl = async (url) => {
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-0' } })
    await res.body?.cancel()
    if (res.ok) return (res.headers.get('content-type') ?? '').startsWith('image/')
    return res.status >= 500 || res.status === 429 ? null : false
  } catch {
    return null
  }
}

// Keyset pagination on store__track_id so the walk is stable whether or not
// rows drop out of the candidate set as they are fixed. Without verifyExisting
// only store tracks with a preview lacking a non-empty waveform URL are read.
const queryCandidates = ({ verifyExisting, trackIds }, afterStoreTrackId, count) =>
  pg.queryRowsAsync(sql`-- backfillBeatportWaveforms candidates
SELECT st.store__track_id       AS "storeTrackDbId"
     , st.track_id              AS "trackId"
     , st.store__track_store_id AS "storeTrackId"
     , JSON_AGG(JSON_BUILD_OBJECT(
         'previewId', p.store__track_preview_id,
         'urls', (SELECT COALESCE(JSON_AGG(w.store__track_preview_waveform_url), '[]')
                  FROM store__track_preview_waveform w
                  WHERE w.store__track_preview_id = p.store__track_preview_id
                    AND w.store__track_preview_waveform_url <> '')
       ) ORDER BY p.store__track_preview_id) AS previews
FROM
  store__track st
  JOIN store s ON s.store_id = st.store_id
  JOIN store__track_preview p ON p.store__track_id = st.store__track_id
WHERE s.store_url = ${STORE_URL}
  AND st.store__track_id > ${afterStoreTrackId}
  AND (${trackIds ?? null}::INT[] IS NULL OR st.track_id = ANY (${trackIds ?? null}::INT[]))
  AND (${verifyExisting}::BOOLEAN OR EXISTS (
    SELECT 1
    FROM store__track_preview p2
    WHERE p2.store__track_id = st.store__track_id
      AND NOT EXISTS (SELECT 1
                      FROM store__track_preview_waveform w2
                      WHERE w2.store__track_preview_id = p2.store__track_preview_id
                        AND w2.store__track_preview_waveform_url <> '')))
GROUP BY 1, 2, 3
ORDER BY 1
LIMIT ${count}
`)

const queryWaveformCountsTotal = () =>
  pg.queryRowsAsync(sql`-- backfillBeatportWaveforms summary
SELECT COUNT(*)::INT AS "beatportPreviews"
     , (COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1
                                          FROM store__track_preview_waveform w
                                          WHERE w.store__track_preview_id = p.store__track_preview_id
                                            AND w.store__track_preview_waveform_url <> '')))::INT AS "withoutWaveform"
FROM
  store__track_preview p
  JOIN store__track st ON st.store__track_id = p.store__track_id
  JOIN store s ON s.store_id = st.store_id
WHERE s.store_url = ${STORE_URL}
`)

// Marks each stored URL as working or broken. Without verifyExisting every
// stored non-empty URL counts as working.
const findPreviewsWithoutWorkingWaveform = async (candidates, { verifyExisting, checkUrl, stats }) => {
  const urlStatus = new Map()
  if (verifyExisting) {
    const urls = [...new Set(candidates.flatMap(({ previews }) => previews.flatMap(({ urls }) => urls)))]
    await BPromise.map(
      urls,
      async (url) => {
        const status = await checkUrl(url)
        stats.urlsChecked++
        if (status === false) stats.brokenUrls++
        if (status === null) stats.urlCheckErrors++
        urlStatus.set(url, status)
      },
      { concurrency: MAX_PARALLEL_URL_CHECKS },
    )
  }

  // A preview needs a waveform when none of its stored URLs works (vacuously true when it has none)
  return candidates
    .map((candidate) => ({
      ...candidate,
      targets: candidate.previews
        .filter(({ urls }) => urls.every((url) => urlStatus.get(url) === false))
        .map(({ previewId, urls }) => ({ previewId, brokenUrls: urls })),
    }))
    .filter(({ targets }) => targets.length > 0)
}

// Replaces the empty, NULL and broken waveform rows of the target previews
// with the upstream waveform. Previews that already have the URL keep it.
const writeWaveforms = (sourceId, { trackId, targets }, waveformUrl) =>
  BPromise.using(pg.getTransaction(), async (tx) => {
    const previewIds = targets.map(({ previewId }) => previewId)
    const brokenUrls = targets.flatMap(({ brokenUrls }) => brokenUrls).filter((url) => url !== waveformUrl)
    await tx.queryAsync(sql`-- backfillBeatportWaveforms DELETE unusable waveforms
DELETE
FROM store__track_preview_waveform
WHERE store__track_preview_id = ANY (${previewIds}::INT[])
  AND (store__track_preview_waveform_url IS NULL
    OR store__track_preview_waveform_url = ''
    OR store__track_preview_waveform_url = ANY (${brokenUrls}::TEXT[]))
`)
    await tx.queryAsync(sql`-- backfillBeatportWaveforms INSERT waveforms
INSERT
INTO store__track_preview_waveform
  (store__track_preview_id, store__track_preview_waveform_url, store__track_preview_waveform_source)
SELECT UNNEST(${previewIds}::INT[]), ${waveformUrl}, ${sourceId}
ON CONFLICT ON CONSTRAINT store__track_preview_waveform_store__track_preview_id_url_key DO NOTHING
`)
    await refreshTrackDetails(tx, trackId)
  })

const backfillBeatportWaveforms = (module.exports.backfillBeatportWaveforms = async ({
  apply = false,
  verifyExisting = false,
  limit = Infinity,
  batchSize = 50,
  trackIds,
  concurrency = 1,
  checkUrl = checkWaveformUrl,
  log = console.log,
} = {}) => {
  log(
    `Beatport waveform backfill (${apply ? 'APPLY' : 'DRY-RUN'}${verifyExisting ? ', verifying stored URLs' : ''})`,
  )
  const [before] = await queryWaveformCountsTotal()
  log(`Beatport previews: ${before.beatportPreviews}, without waveform: ${before.withoutWaveform}\n`)

  const stats = {
    candidates: 0,
    storeTracksMissing: 0,
    previewsMissing: 0,
    urlsChecked: 0,
    brokenUrls: 0,
    urlCheckErrors: 0,
    notFound: 0,
    noUpstreamWaveform: 0,
    upstreamUnchanged: 0,
    updated: 0,
    previewsUpdated: 0,
    failed: 0,
  }
  const sourceId = apply ? await insertSource({ operation: 'backfillBeatportWaveforms' }) : null
  let afterStoreTrackId = 0
  const fetchState = { batchingWorks: true }

  while (stats.candidates < limit) {
    const candidates = await queryCandidates(
      { verifyExisting, trackIds },
      afterStoreTrackId,
      Math.min(batchSize, limit - stats.candidates),
    )
    if (candidates.length === 0) break
    afterStoreTrackId = candidates[candidates.length - 1].storeTrackDbId
    stats.candidates += candidates.length

    const missing = await findPreviewsWithoutWorkingWaveform(candidates, { verifyExisting, checkUrl, stats })
    stats.storeTracksMissing += missing.length
    stats.previewsMissing += missing.reduce((sum, { targets }) => sum + targets.length, 0)
    if (missing.length === 0) continue

    const fetchStart = Date.now()
    const fetched = await fetchTracks(
      missing.map(({ storeTrackId }) => storeTrackId),
      fetchState,
      log,
    )

    const toWrite = []
    for (const candidate of missing) {
      const { trackId, storeTrackId, targets } = candidate
      const raw = fetched.get(storeTrackId)
      if (!raw) {
        stats.notFound++
        continue
      }
      const waveformUrl = beatportTrackTransform(raw).waveform?.url
      if (!waveformUrl) {
        stats.noUpstreamWaveform++
        continue
      }
      if (targets.every(({ brokenUrls }) => brokenUrls.includes(waveformUrl))) {
        // Beatport still points at the URL that fails to load; nothing better to store
        stats.upstreamUnchanged++
        continue
      }

      if (!apply) {
        if (stats.updated < 20) log(`  track#${trackId} (bp ${storeTrackId}): ${targets.length} preview(s) <- ${waveformUrl}`)
        stats.updated++
        stats.previewsUpdated += targets.length
        continue
      }
      toWrite.push({ candidate, waveformUrl })
    }

    const writeStart = Date.now()
    await BPromise.map(
      toWrite,
      async ({ candidate, waveformUrl }) => {
        try {
          await writeWaveforms(sourceId, candidate, waveformUrl)
          stats.updated++
          stats.previewsUpdated += candidate.targets.length
        } catch (e) {
          stats.failed++
          log(`  track#${candidate.trackId} (bp ${candidate.storeTrackId}) failed: ${e.message}`)
        }
      },
      { concurrency },
    )
    const seconds = (ms) => (ms / 1000).toFixed(1)
    log(
      `Processed ${stats.candidates} candidates (last store__track_id ${afterStoreTrackId}; ` +
        `fetch ${seconds(writeStart - fetchStart)}s, ${toWrite.length} writes ${seconds(Date.now() - writeStart)}s)`,
    )
  }

  log(`\nStore tracks with previews lacking a working waveform: ${stats.storeTracksMissing} (${stats.previewsMissing} previews)`)
  if (verifyExisting) {
    log(`Stored URLs checked: ${stats.urlsChecked}, broken: ${stats.brokenUrls}, check errors: ${stats.urlCheckErrors}`)
  }
  log(`${apply ? 'Updated' : 'Would update'}: ${stats.updated} store tracks (${stats.previewsUpdated} previews)`)
  log(`Not available on Beatport (removed, territory-restricted or fetch failed): ${stats.notFound}`)
  log(`Beatport has no waveform for the track: ${stats.noUpstreamWaveform}`)
  if (verifyExisting) log(`Beatport still returns the broken URL: ${stats.upstreamUnchanged}`)
  if (apply) log(`Failed: ${stats.failed}`)

  if (apply) {
    const [after] = await queryWaveformCountsTotal()
    log(`\nBeatport previews without waveform: ${before.withoutWaveform} -> ${after.withoutWaveform}`)
  } else {
    log('\nDry run: pass --apply to write the waveforms.')
  }
  return stats
})

if (require.main === module) {
  const args = process.argv.slice(2)
  const hasFlag = (name) => args.includes(`--${name}`)
  const flagValue = (name) => {
    const prefix = `--${name}=`
    const found = args.find((a) => a.startsWith(prefix))
    return found ? found.slice(prefix.length) : undefined
  }

  backfillBeatportWaveforms({
    apply: hasFlag('apply'),
    verifyExisting: hasFlag('verify-existing'),
    limit: flagValue('limit') ? parseInt(flagValue('limit'), 10) : Infinity,
    batchSize: Math.min(parseInt(flagValue('batch-size') ?? '50', 10), 100),
    trackIds: flagValue('track-ids')
      ?.split(',')
      .map((id) => parseInt(id, 10)),
    concurrency: parseInt(flagValue('concurrency') ?? '1', 10),
  })
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
}

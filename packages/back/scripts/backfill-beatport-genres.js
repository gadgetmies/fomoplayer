#!/usr/bin/env node

// Backfills genres for Beatport tracks that were stored without them.
//
// Ingestion never revisits a track once its URL is stored
// (addStoreTracksToUsers skips known URLs), so tracks ingested before genre
// support, or through a payload that lacked genre data, stay genre-less
// forever. Separately, the transform used to read `subgenre` while the v4 API
// returns `sub_genre`, so no sub-genres were ever stored.
//
// This script re-fetches the affected tracks from the Beatport v4 API, runs
// them through the same transform as ingestion, and writes the genres through
// the same helper as addStoreTrack (track__genre, artist__genre, track_details).
//
// It is DRY-RUN by default. Flags:
//   --apply              write the genres (otherwise only report)
//   --include-existing   also revisit tracks that already have a genre, to pick
//                        up the sub-genres the old transform dropped
//   --limit=N            stop after N candidate tracks (default: all)
//   --batch-size=N       ids per v4 request (default: 50, max 100)
//   --track-ids=1,2,3    only these (internal) track ids
//   --concurrency=N      tracks written in parallel (default: 1). Writes are
//                        round-trip bound, so raise this when the database is
//                        remote. A rare unique-violation race on a brand-new
//                        genre fails that track only; a re-run picks it up.
//
// Needs the backend env (DATABASE_URL, STATEMENT_TIMEOUT, BEATPORT_USERNAME,
// BEATPORT_PASSWORD), e.g. `npx dotenv -e .env.development -- node scripts/...`.

const BPromise = require('bluebird')
const sql = require('sql-template-strings')
const pg = require('fomoplayer_shared').db.pg
const bpApi = require('../routes/stores/beatport/bp-api')
const { storeUrl: STORE_URL } = require('../routes/stores/beatport/logic')
const { beatportTrackTransform } = require('fomoplayer_browser_extension/src/js/transforms/beatport')
const { addGenresToTrack, refreshTrackDetails } = require('../routes/shared/db/store')

// Kept low so the per-track fallback stays well clear of Beatport's rate limit.
const MAX_PARALLEL_FETCHES = 6

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Beatport rate-limits bursts with 429; back off rather than abort the run.
const withRetry = async (fn, log, attempt = 1) => {
  try {
    return await fn()
  } catch (e) {
    if (/\((429|5\d\d)\)/.test(e.message) && attempt <= 5) {
      const delay = 2 ** attempt * 1000
      log(`  API error (${e.message.slice(0, 60)}), retrying in ${delay / 1000}s`)
      await sleep(delay)
      return withRetry(fn, log, attempt + 1)
    }
    throw e
  }
}

// Keyset pagination on track_id so the walk is stable whether or not rows
// drop out of the candidate set as they are fixed.
const queryCandidates = ({ includeExisting, trackIds }, afterTrackId, count) =>
  pg.queryRowsAsync(sql`-- backfillBeatportGenres candidates
SELECT DISTINCT ON (st.track_id) st.track_id AS "trackId"
                               , st.store__track_store_id AS "storeTrackId"
FROM
  store__track st
  JOIN store s ON s.store_id = st.store_id
WHERE s.store_url = ${STORE_URL}
  AND st.track_id > ${afterTrackId}
  AND (${includeExisting}::BOOLEAN OR NOT EXISTS (SELECT 1 FROM track__genre tg WHERE tg.track_id = st.track_id))
  AND (${trackIds ?? null}::INT[] IS NULL OR st.track_id = ANY (${trackIds ?? null}::INT[]))
ORDER BY st.track_id, st.store__track_id
LIMIT ${count}
`)

const queryStoreId = async () => {
  const [{ storeId }] = await pg.queryRowsAsync(
    sql`SELECT store_id AS "storeId" FROM store WHERE store_url = ${STORE_URL}`,
  )
  return storeId
}

const queryGenreCountsTotal = () =>
  pg.queryRowsAsync(sql`-- backfillBeatportGenres summary
SELECT COUNT(DISTINCT st.track_id)                                      AS "beatportTracks"
     , COUNT(DISTINCT st.track_id) FILTER (WHERE tg.track_id IS NULL)   AS "withoutGenre"
FROM
  store__track st
  JOIN store s ON s.store_id = st.store_id
  LEFT JOIN track__genre tg ON tg.track_id = st.track_id
WHERE s.store_url = ${STORE_URL}
`)

// Fetches the raw v4 track objects for the given Beatport ids, keyed by id.
// Uses the id-filtered collection and falls back to per-track requests for
// any id the batch did not return (and for everything if batching turns out
// not to filter at all).
const fetchTracks = async (storeTrackIds, state, log) => {
  const byId = new Map()
  if (state.batchingWorks && storeTrackIds.length > 1) {
    const results = await withRetry(() => bpApi.getTracksByIds(storeTrackIds), log)
    for (const track of results ?? []) {
      if (storeTrackIds.includes(String(track.id))) byId.set(String(track.id), track)
    }
    if (byId.size === 0 && (results ?? []).length > 0) {
      log('  The v4 id filter returned unrelated tracks; switching to per-track requests')
      state.batchingWorks = false
    }
  }

  await BPromise.map(
    storeTrackIds.filter((id) => !byId.has(id)),
    async (id) => {
      try {
        byId.set(id, await withRetry(() => bpApi.getTrack(id), log))
      } catch (e) {
        // 404: removed from the catalog. 403 "Territory Restricted": not
        // licensed in the account's region. Both are simply unavailable; any
        // other failure is logged and the track is left for a later run.
        if (!/\((403|404)\)/.test(e.message)) log(`  bp ${id} fetch failed: ${e.message.slice(0, 120)}`)
      }
    },
    { concurrency: MAX_PARALLEL_FETCHES },
  )
  return byId
}

const writeGenres = (storeId, trackId, genres) =>
  BPromise.using(pg.getTransaction(), async (tx) => {
    const artistIds = (
      await tx.queryRowsAsync(
        sql`SELECT DISTINCT artist_id AS "artistId" FROM track__artist WHERE track_id = ${trackId}`,
      )
    ).map(({ artistId }) => artistId)
    await addGenresToTrack(tx, storeId, trackId, artistIds, genres)
    await refreshTrackDetails(tx, trackId)
  })

const backfillBeatportGenres = (module.exports.backfillBeatportGenres = async ({
  apply = false,
  includeExisting = false,
  limit = Infinity,
  batchSize = 50,
  trackIds,
  concurrency = 1,
  log = console.log,
} = {}) => {
  log(
    `Beatport genre backfill (${apply ? 'APPLY' : 'DRY-RUN'}${includeExisting ? ', including tracks with genres' : ''})`,
  )
  const [before] = await queryGenreCountsTotal()
  log(`Beatport tracks: ${before.beatportTracks}, without genre: ${before.withoutGenre}\n`)

  const storeId = await queryStoreId()
  const stats = { candidates: 0, notFound: 0, noUpstreamGenre: 0, updated: 0, failed: 0 }
  const genreCounts = new Map()
  let afterTrackId = 0
  const fetchState = { batchingWorks: true }

  while (stats.candidates < limit) {
    const candidates = await queryCandidates(
      { includeExisting, trackIds },
      afterTrackId,
      Math.min(batchSize, limit - stats.candidates),
    )
    if (candidates.length === 0) break
    afterTrackId = candidates[candidates.length - 1].trackId
    stats.candidates += candidates.length

    const fetchStart = Date.now()
    const fetched = await fetchTracks(
      candidates.map(({ storeTrackId }) => storeTrackId),
      fetchState,
      log,
    )

    const toWrite = []
    for (const { trackId, storeTrackId } of candidates) {
      const raw = fetched.get(storeTrackId)
      if (!raw) {
        stats.notFound++
        continue
      }
      const { genres = [] } = beatportTrackTransform(raw)
      if (genres.length === 0) {
        stats.noUpstreamGenre++
        continue
      }
      for (const { name } of genres) genreCounts.set(name, (genreCounts.get(name) ?? 0) + 1)

      if (!apply) {
        if (stats.updated < 20) log(`  track#${trackId} (bp ${storeTrackId}): ${genres.map((g) => g.name).join(', ')}`)
        stats.updated++
        continue
      }
      toWrite.push({ trackId, storeTrackId, genres })
    }

    const writeStart = Date.now()
    await BPromise.map(
      toWrite,
      async ({ trackId, storeTrackId, genres }) => {
        try {
          await writeGenres(storeId, trackId, genres)
          stats.updated++
        } catch (e) {
          stats.failed++
          log(`  track#${trackId} (bp ${storeTrackId}) failed: ${e.message}`)
        }
      },
      { concurrency },
    )
    const seconds = (ms) => (ms / 1000).toFixed(1)
    log(
      `Processed ${stats.candidates} candidates (last track_id ${afterTrackId}; ` +
        `fetch ${seconds(writeStart - fetchStart)}s, ${toWrite.length} writes ${seconds(Date.now() - writeStart)}s)`,
    )
  }

  log(`\n${apply ? 'Updated' : 'Would update'}: ${stats.updated}`)
  log(`Not available on Beatport (removed, territory-restricted or fetch failed): ${stats.notFound}`)
  log(`Beatport has no genre for the track: ${stats.noUpstreamGenre}`)
  if (apply) log(`Failed: ${stats.failed}`)
  log('\nGenres seen:')
  for (const [name, count] of [...genreCounts].sort((a, b) => b[1] - a[1])) log(`  ${count}\t${name}`)

  if (apply) {
    const [after] = await queryGenreCountsTotal()
    log(`\nBeatport tracks without genre: ${before.withoutGenre} -> ${after.withoutGenre}`)
  } else {
    log('\nDry run: pass --apply to write the genres.')
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

  backfillBeatportGenres({
    apply: hasFlag('apply'),
    includeExisting: hasFlag('include-existing'),
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

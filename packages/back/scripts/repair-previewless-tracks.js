#!/usr/bin/env node

// Restores missing previews and removes tracks whose preview cannot be restored.
//
// track_details() needs a preview, so a track without one never gets a
// track_details row and the track lists never show it. Two kinds of tracks have
// no preview:
//
//   - Bandcamp tracks from 2020-21 whose preview rows are gone. Bandcamp
//     previews carry no URL: playback looks the stream up on the release page
//     by the store track id, so the preview is restored by adding the row back
//     when the release still streams the track.
//   - Tracks with no store track left at all, which have nothing to fetch a
//     preview from.
//
// A track whose preview cannot be restored is deleted, unless it is in a cart.
// Deleting a track cascades to its store tracks, credits and users' track
// lists. A release that cannot be fetched for any other reason than a 404 (a
// rate limit, a server error) leaves its tracks alone.
//
// It is DRY-RUN by default. Flags:
//   --apply              restore and delete (otherwise only report)
//   --track-ids=1,2,3    only these (internal) track ids
//
// Needs the backend env (DATABASE_URL, STATEMENT_TIMEOUT), e.g.
// `npx dotenv -e .env.development -- node scripts/repair-previewless-tracks.js`.

const BPromise = require('bluebird')
const sql = require('sql-template-strings')
const pg = require('fomoplayer_shared').db.pg
const { getReleaseAsync } = require('../routes/stores/bandcamp/bandcamp-api')
const { storeUrl: BANDCAMP_STORE_URL } = require('../routes/stores/bandcamp/logic')
const { refreshTrackDetails } = require('../routes/shared/db/store')
const { insertSource } = require('../jobs/watches/shared/db')

const RELEASE_URL_PATTERN = '^https://[a-z0-9-]+\\.bandcamp\\.com/'

const queryPreviewlessTracks = (trackIds) =>
  pg.queryRowsAsync(sql`-- repairPreviewlessTracks candidates
SELECT t.track_id                                                           AS "trackId"
     , t.track_title                                                        AS title
     , t.track_duration_ms                                                  AS "durationMs"
     , EXISTS (SELECT 1 FROM track__cart tc WHERE tc.track_id = t.track_id) AS "inCart"
     , (SELECT COALESCE(JSON_AGG(JSON_BUILD_OBJECT(
                 'storeTrackDbId', st.store__track_id,
                 'storeTrackId', st.store__track_store_id,
                 'store', s.store_url,
                 'releaseUrl', (SELECT MIN(sr.store__release_url)
                                FROM release__track rt
                                  JOIN store__release sr ON sr.release_id = rt.release_id
                                WHERE rt.track_id = t.track_id
                                  AND sr.store_id = s.store_id
                                  AND sr.store__release_url ~ ${RELEASE_URL_PATTERN})
               ) ORDER BY st.store__track_id), '[]')
        FROM store__track st
          JOIN store s ON s.store_id = st.store_id
        WHERE st.track_id = t.track_id)                                     AS "storeTracks"
FROM track t
WHERE NOT EXISTS (SELECT 1
                  FROM store__track st
                    JOIN store__track_preview p ON p.store__track_id = st.store__track_id
                  WHERE st.track_id = t.track_id)
  AND (${trackIds ?? null}::INT[] IS NULL OR t.track_id = ANY (${trackIds ?? null}::INT[]))
ORDER BY t.track_id`)

// The stream of a Bandcamp track, as playback finds it: null when the release
// no longer streams it, undefined when the release could not be checked.
const findBandcampStream = async (releaseCache, getRelease, { releaseUrl, storeTrackId }) => {
  if (!releaseUrl) return null
  if (!releaseCache.has(releaseUrl)) {
    releaseCache.set(
      releaseUrl,
      getRelease(releaseUrl).catch((e) => {
        if (e.isRateLimit) throw e
        return e.statusCode === 404 ? { trackinfo: [] } : undefined
      }),
    )
  }
  const release = await releaseCache.get(releaseUrl)
  if (!release) return undefined
  const track = release.trackinfo?.find(({ track_id, id }) => String(track_id ?? id) === String(storeTrackId))
  return track?.file?.['mp3-128'] ? { durationMs: Math.round(track.duration * 1000) } : null
}

module.exports.repairPreviewlessTracks = async ({
  apply = false,
  trackIds,
  getRelease = getReleaseAsync,
  log = console.log,
} = {}) => {
  const tracks = await queryPreviewlessTracks(trackIds)
  const releaseCache = new Map()
  const toRestore = []
  const toDelete = []
  const keptInCart = []
  const unknown = []
  let rateLimited = false

  for (const track of tracks) {
    let restorable = null
    let checkFailed = false
    for (const storeTrack of track.storeTracks) {
      if (storeTrack.store !== BANDCAMP_STORE_URL) {
        // Only Bandcamp previews can be rebuilt; leave other stores' tracks alone
        checkFailed = true
        continue
      }
      let stream
      try {
        stream = await findBandcampStream(releaseCache, getRelease, storeTrack)
      } catch (e) {
        rateLimited = true
        break
      }
      if (stream === undefined) checkFailed = true
      else if (stream) {
        restorable = { ...storeTrack, durationMs: track.durationMs ?? stream.durationMs }
        break
      }
    }
    if (rateLimited) {
      log(`Rate limited by Bandcamp at track ${track.trackId}; run again later to continue`)
      break
    }

    const label = `${track.trackId} "${track.title}"`
    if (restorable) {
      toRestore.push({ trackId: track.trackId, ...restorable })
      log(`  restore ${label} (${restorable.releaseUrl})`)
    } else if (checkFailed) {
      unknown.push(track.trackId)
      log(`  unknown ${label}: its store could not be checked`)
    } else if (track.inCart) {
      keptInCart.push(track.trackId)
      log(`  keep    ${label}: no preview, but in a cart`)
    } else {
      toDelete.push({ trackId: track.trackId, title: track.title, stores: track.storeTracks.length })
      log(`  delete  ${label}${track.storeTracks.length === 0 ? ': no store track' : ': not streamed any more'}`)
    }
  }

  if (apply && toRestore.length > 0) {
    const sourceId = await insertSource({ operation: 'repairPreviewlessTracks', storeUrl: BANDCAMP_STORE_URL })
    await BPromise.using(pg.getTransaction(), async (tx) => {
      for (const { storeTrackDbId, durationMs } of toRestore) {
        await tx.queryAsync(sql`-- repairPreviewlessTracks restore preview
INSERT INTO store__track_preview (store__track_id, store__track_preview_format, store__track_preview_start_ms,
                                  store__track_preview_end_ms, store__track_preview_source)
VALUES (${storeTrackDbId}, 'mp3', 0, ${durationMs}, ${sourceId})`)
      }
      await refreshTrackDetails(
        tx,
        toRestore.map(({ trackId }) => trackId),
      )
    })
  }
  if (apply && toDelete.length > 0) {
    // Logged in full so a deletion can be traced afterwards
    log(JSON.stringify({ operation: 'repairPreviewlessTracks', deletedTracks: toDelete }))
    await pg.queryAsync(sql`-- repairPreviewlessTracks delete
DELETE FROM track
WHERE track_id = ANY (${toDelete.map(({ trackId }) => trackId)}::INT[])
  AND NOT EXISTS (SELECT 1 FROM track__cart tc WHERE tc.track_id = track.track_id)`)
  }

  return {
    candidates: tracks.length,
    restored: toRestore.length,
    deleted: toDelete.length,
    keptInCart: keptInCart.length,
    unknown,
    rateLimited,
    apply,
  }
}

if (require.main === module) {
  const args = process.argv.slice(2)
  const flagValue = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
  const apply = args.includes('--apply')
  const trackIds = flagValue('track-ids')?.split(',').map(Number)

  module.exports
    .repairPreviewlessTracks({ apply, trackIds })
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2))
      if (!apply) console.log('Dry run: nothing written. Re-run with --apply to restore and delete.')
      process.exit(0)
    })
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
}

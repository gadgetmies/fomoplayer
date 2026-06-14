const { getArtistTracks, getLabelTracks, getPlaylistTracks, storeName } = require('../../routes/stores/bandcamp/logic')
const logger = require('fomoplayer_shared').logger(__filename)
const sql = require('sql-template-strings')
const pg = require('fomoplayer_shared').db.pg

// Must be present AND non-null on every fetched track.
const requiredTrackProperties = [
  'id',
  'title',
  'artists',
  'released',
  'published',
  'duration_ms',
  'release',
  'previews',
  'store_details',
]

// Must be present as keys (the transform always emits them) but may legitimately
// be null on Bandcamp: `version` is null for tracks without a remix/version, and
// `label` is null on artist pages (the subdomain is the artist, not a label).
const nullableTrackProperties = ['version', 'label']

async function getArtistDetails() {
  const [details] = await pg.queryRowsAsync(sql`
    -- Bandcamp integration test job get artist store id
    SELECT store__artist_store_id AS "artistStoreId", store__artist_url AS url
    FROM
      store__artist
      NATURAL JOIN artist
      NATURAL JOIN store
    WHERE artist_name = 'Noisia'
      AND store_name = ${storeName}
  `)
  return details
}

async function getLabelDetails() {
  const [details] = await pg.queryRowsAsync(sql`
    -- Bandcamp integration test job get artist store id
    SELECT store__label_store_id AS "labelStoreId", store__label_url AS url
    FROM
      store__label
      NATURAL JOIN label
      NATURAL JOIN store
    WHERE label_name = 'VISION'
      AND store_name = ${storeName}
  `)
  return details
}

module.exports = async () => {
  const artistDetails = await getArtistDetails()
  const labelDetails = await getLabelDetails()

  const drumAndBassPlaylist = 'https://bandcamp.com/discover/electronic?tags=drum-bass'
  const detailsAndFunctions = [
    [artistDetails, getArtistTracks],
    [labelDetails, getLabelTracks],
    [{ playlistStoreId: drumAndBassPlaylist, url: drumAndBassPlaylist }, getPlaylistTracks],
  ]

  let combinedErrors = []
  for (const [details, fn] of detailsAndFunctions) {
    // Bandcamp generators stream incrementally: the first yield is a bookkeeping
    // progress object with empty `tracks`, then each subsequent yield carries the
    // tracks (and any errors) for a single release. Accumulate across all yields
    // so a single empty/failed release does not look like a total failure.
    const fetchedTracks = []
    const perReleaseErrors = []
    try {
      const generator = fn(details)
      for await (const { tracks, errors } of generator) {
        if (errors && errors.length > 0) {
          perReleaseErrors.push(...errors)
        }
        if (tracks && tracks.length > 0) {
          fetchedTracks.push(...tracks)
        }
      }
    } catch (e) {
      logger.error(`Bandcamp integration test ${fn.name} failed: ${e.toString().substring(0, 100)}`)
      combinedErrors.push(e)
      continue
    }

    // Per-release errors are partial (a deleted/region-locked/prerelease release
    // can fail on its own) and expected at scale, so surface them for visibility
    // but do not fail the smoke test on them — total failure is "no tracks at all"
    // or a structurally broken track, checked below.
    if (perReleaseErrors.length > 0) {
      logger.warn(
        `Per-release errors while fetching tracks for (${details.url}): ${JSON.stringify(perReleaseErrors)}`,
      )
    }

    if (fetchedTracks.length === 0) {
      const error = `No tracks fetched for (${details.url})`
      logger.error(error)
      combinedErrors.push(error)
      continue
    }

    const track = fetchedTracks[0]
    const missingTrackProperties = requiredTrackProperties
      .filter((prop) => !track.hasOwnProperty(prop) || track[prop] === null)
      .concat(nullableTrackProperties.filter((prop) => !track.hasOwnProperty(prop)))

    if (missingTrackProperties.length !== 0) {
      const error = `Missing properties in fetched tracks for (${details.url}): ${missingTrackProperties.join(
        ', ',
      )}`
      logger.error(error)
      combinedErrors.push(error)
    }
  }

  if (combinedErrors.length !== 0) {
    return { result: combinedErrors, success: false }
  }

  return { success: true }
}

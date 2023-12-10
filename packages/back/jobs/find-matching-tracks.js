const pg = require('../db/pg')
const sql = require('sql-template-strings')
const R = require('ramda')
const { insertSource } = require('./watches/shared/db.js')
const { addStoreTracksToUsers, getUsersFollowingLabel } = require('../routes/shared/tracks.js')
const logger = require('../logger')(__filename)

const beatportModule = require('../routes/stores/beatport/logic')
const spotifyModule = require('../routes/stores/spotify/logic')

async function processMissingBeatportTracks(missingFromBeatport, sourceId) {
  logger.debug('Prosessing missing Beatport tracks', { missingFromBeatport })
  let beatportTracks = []
  try {
    beatportTracks = missingFromBeatport
      ? await beatportModule.getTracksForISRCs(missingFromBeatport.map(R.prop('isrc')))
      : []
    logger.debug('Beatport tracks for ISRCs', { beatportTracks })
    const beatportLabelTracks = R.groupBy(R.path(['label', 'id']))(beatportTracks)
    for (const [labelId, tracks] of Object.entries(beatportLabelTracks)) {
      // TODO: optimise to use only one query
      if (labelId === undefined) {
        continue
      }
      const users = await getUsersFollowingLabel(labelId)
      logger.debug('Adding missing tracks to users following label', { labelId, users, tracks })
      await addStoreTracksToUsers(beatportModule.storeUrl, tracks, users, sourceId)
    }
    logger.debug('Beatport tracks added to users', { beatportTracks })
    return { errors: [] }
  } catch (e) {
    logger.error('Beatport ISRC search failed', e)
    return { errors: [{ message: e.message, stack: e.stack }] }
  }
}

async function processMissingSpotifyTracks(missingFromSpotify, sourceId) {
  logger.debug('Prosessing missing Spotify tracks', { missingFromSpotify })
  let spotifyTracks = []
  try {
    spotifyTracks = missingFromSpotify
      ? await spotifyModule.getTracksForISRCs(missingFromSpotify.map(R.prop('isrc')))
      : []
    logger.debug('Spotify tracks for ISRCs', { spotifyTracks })
    await addStoreTracksToUsers(spotifyModule.storeUrl, spotifyTracks, [], sourceId)
    logger.debug('Spotify tracks added to users', { spotifyTracks })
    return { errors: [] }
  } catch (e) {
    logger.error('Spotify ISRC search failed', e)
    return { errors: [{ message: e.message, stack: e.stack }] }
  }
}

module.exports.findMatchingTracks = async jobDetails => {
  logger.debug('findMatchingTracks', { jobDetails })
  const sourceId = await insertSource({ operation: 'findMatchingTracks', jobDetails })

  const missingFromOneStore = await pg.queryRowsAsync(sql`
    -- findMatchingTracks
    SELECT track_id                                                         AS id
         , track_isrc                                                       AS isrc
         , ARRAY_AGG(JSON_BUILD_OBJECT('id', store_id, 'name', store_name)) AS stores
    FROM
      track
      NATURAL JOIN store__track
      NATURAL JOIN store
    WHERE store_name IN ('Spotify', 'Beatport')
      AND track_isrc_update_time IS NULL
       OR track_isrc_update_time < NOW() - INTERVAL '1 day'
    GROUP BY track_id, track_isrc, track_isrc_update_time
    HAVING COUNT(store_id) < 2
    ORDER BY track_isrc_update_time DESC
    LIMIT 200
  `)

  // TODO: move to SQL
  const missing = Object.values(R.groupBy(R.path(['stores', 0, 'id']))(missingFromOneStore))
  const missingFromBeatport = missing.find(R.pathEq(['0', 'stores', 0, 'name'], 'Spotify'))
  const missingFromSpotify = missing.find(R.pathEq(['0', 'stores', 0, 'name'], 'Beatport'))
  
  await pg.queryAsync(sql`
    UPDATE track
    SET track_isrc_update_time = NOW()
    WHERE track_id = ANY (${missingFromOneStore.map(R.prop('id'))})
  `)

  const [{ errors: beatportErrors }, { errors: spotifyErrors }] = await Promise.all([
    processMissingBeatportTracks(missingFromBeatport, sourceId),
    processMissingSpotifyTracks(missingFromSpotify, sourceId)
  ])

  const errors = [...beatportErrors, ...spotifyErrors]
  if (errors.length > 0) {
    logger.error('findMatchingTracks failed', { errors })
    return { success: false, errors }
  }

  return { success: true }
}

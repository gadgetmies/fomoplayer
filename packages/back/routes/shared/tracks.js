const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')
const R = require('ramda')
const { setArtistUpdated, setPlaylistUpdated, setLabelUpdated } = require('./db/watch')
const { modules: storeModules } = require('../stores/store-modules')
const BPromise = require('bluebird')
const { updateIgnoresInUserTracks } = require('../shared/db/user')
const logger = require('fomoplayer_shared').logger(__filename)

const { addStoreTrack, ensureArtistExists, ensureReleaseExists, ensureLabelExists } = require('../shared/db/store')

const {
  addPurchasedStoreTrackToUser,
  addTrackToUser: addTrackToUserDb,
  artistOnLabelInIgnore,
  addTracksToUser,
} = require('../users/db.js')
const { apiURL } = require('../../config.js')
const { queryTracksForStoreIds, queryTrackDetails, queryStoredTracksForUrls } = require('./db/tracks')
const { queryLabelForRelease } = require('./db/release')

const getUsersFollowingArtist = async (storeArtistId) => {
  const [{ users }] = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`--getUsersFollowingArtist
SELECT
  ARRAY_AGG(meta_account_user_id) AS users
FROM
  store__artist_watch__user
  NATURAL JOIN store__artist_watch
WHERE
  store__artist_id = ${storeArtistId}`,
  )

  return users
}

const getUsersFollowingLabel = (module.exports.getUsersFollowingLabel = async (storeLabelId) => {
  const [{ users }] = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`--getUsersFollowingLabel
SELECT
  ARRAY_AGG(meta_account_user_id) AS users
FROM
  store__label_watch__user
  NATURAL JOIN store__label_watch
WHERE
  store__label_id = ${storeLabelId}`,
  )

  return users || []
})

const getUsersFollowingPlaylist = async (playlistId) => {
  const [{ users }] = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`--getUsersFollowingArtist
SELECT
  ARRAY_AGG(meta_account_user_id) AS users
FROM
  user__playlist_watch
WHERE
  playlist_id = ${playlistId}`,
  )

  return users
}

const getStoreModule = function (storeUrl) {
  const module = Object.values(storeModules).find((module) => module.logic.storeUrl === storeUrl)
  if (!module) {
    throw new Error('Store not found for url')
  }

  return module
}

const addStoreTracksToUsers = (module.exports.addStoreTracksToUsers = async (
  storeUrl,
  tracks,
  userIds,
  sourceId,
  skipOld = true,
  type = 'tracks',
) => {
  logger.debug('Start processing received tracks', { userIds, storeUrl, skipOld, type })

  let storedTracks = await queryStoredTracksForUrls(tracks.map(R.prop('url')))
  const filteredTracks = tracks.filter(({ url }) => !storedTracks.find(R.propEq('url', url)))
  if (filteredTracks.length === 0) {
    logger.debug(`All tracks already exist in database (stored count: ${storedTracks.length})`)
  }

  logger.debug(`Adding ${storedTracks.length} existing tracks to ${userIds.length} users`)
  for (const userId of userIds) {
    await BPromise.using(pg.getTransaction(), async (tx) => {
      await addTracksToUser(tx, userId, storedTracks.map(R.prop('id')), sourceId)
      // TODO: this does not take into account the ignores: does it need to?
    })
  }

  logger.debug(`Adding ${filteredTracks.length} new tracks to database`)
  for (const track of filteredTracks) {
    try {
      const trackId = await addStoreTrackToUsers(storeUrl, userIds, track, sourceId, skipOld, type)
      if (trackId) {
        storedTracks.push({ id: trackId })
      }
    } catch (e) {
      logger.error(`Failed to add track to users`, e)
    }
  }

  logger.debug('Updating ignored tracks')
  await BPromise.using(pg.getTransaction(), async (tx) => {
    await updateIgnoresInUserTracks(tx, userIds)
  })

  logger.debug('addStoreTracksToUsers complete')
  return storedTracks.map(R.prop('id'))
})

const addTrackToUser = (module.exports.addTrackToUser = async (tx, userId, artists, trackId, labelId, sourceId) => {
  if (await artistOnLabelInIgnore(tx, userId, artists, labelId)) {
    logger.debug('One of the artists ignored on label by user, skipping', { userId, artists, labelId })
  } else {
    await addTrackToUserDb(tx, userId, trackId, sourceId)
  }
})

const aYear = 1000 * 60 * 60 * 24 * 30 * 12
const addStoreTrackToUsers = async (storeUrl, userIds, track, sourceId, skipOld = true, type = 'tracks') => {
  return BPromise.using(pg.getTransaction(), async (tx) => {
    let labelId
    let releaseId

    if (skipOld && Date.now() - new Date(track.published) > 2 * aYear && type !== 'purchased') {
      logger.info(`Track too old, skipping: ${track.id}`)
    } else {
      if (track.label) {
        labelId = (await ensureLabelExists(tx, storeUrl, track.label, sourceId)).labelId
      }

      let artists = []
      for (const artist of track.artists) {
        // TODO: match by release / isrc
        const res = await ensureArtistExists(tx, storeUrl, artist, sourceId)
        artists.push(res)
      }

      if (track.release) {
        releaseId = await ensureReleaseExists(tx, storeUrl, track.release, artists, sourceId)
      }

      if (releaseId) {
        labelId = (await queryLabelForRelease(tx, releaseId)) || labelId
      }

      const trackId = await addStoreTrack(tx, storeUrl, labelId, releaseId, artists, track, sourceId)

      for (const userId of userIds) {
        await addTrackToUser(tx, userId, artists, trackId, labelId, sourceId)

        if (type === 'purchased') {
          await addPurchasedStoreTrackToUser(tx, userId, track)
        }
      }

      logger.debug(`Stored track: ${trackId}`)
      return trackId
    }
    // TODO: Update materialized views
  })
}

module.exports.updateArtistTracks = async (storeUrl, details, sourceId) => {
  const storeModule = getStoreModule(storeUrl)
  const users = await getUsersFollowingArtist(details.storeArtistId)
  const generator = await storeModule.logic.getArtistTracks(details)
  let combinedErrors = []

  logger.debug(`Processing tracks for artist: ${details.url}`)
  for await (const { tracks, errors } of generator) {
    if (errors.length > 0) {
      logger.error(`Errors in fetching tracks for artist (${details.url}): ${JSON.stringify(errors)}`)
    }

    logger.debug(`Found ${tracks.length} tracks for ${JSON.stringify(details)}`)

    try {
      combinedErrors.concat(errors)
      await addStoreTracksToUsers(storeUrl, tracks, users, sourceId)
    } catch (e) {
      const error = [`Failed to add artist tracks to users`, { error: e.toString(), sourceId, details }]
      combinedErrors.push(error)
      logger.error(`${error[0]}, error: ${JSON.stringify(error[1]).substring(0, 800)}, stack: ${e.stack}`)
    }
  }

  if (combinedErrors.length === 0) {
    await setArtistUpdated(details.storeArtistId)
  }

  logger.debug(`Processing tracks for artist: ${details.url} done. Errors: ${JSON.stringify(combinedErrors)}`)

  return combinedErrors
}

module.exports.updateLabelTracks = async (storeUrl, details, sourceId) => {
  logger.debug(`Updating label tracks: ${details.url}`)
  const storeModule = getStoreModule(storeUrl)
  let users
  try {
    users = await getUsersFollowingLabel(details.storeLabelId)
    logger.debug(`Found ${users.length} users following label ${details.url}`)
  } catch (e) {
    const error = ['Error fetching user follows for label', { error: e.toString(), sourceId, details }]
    logger.error(`${error[0]}, error: ${JSON.stringify(error[1]).substring(0, 800)}, stack: ${e.stack}`)
    return [error]
  }
  const generator = storeModule.logic.getLabelTracks(details)

  logger.debug(`Processing tracks for label: ${details.url}`)
  let combinedErrors = []
  for await (const { tracks, errors } of generator) {
    if (errors.length > 0) {
      logger.error(`Errors in fetching tracks for label (${details.url}): ${JSON.stringify(errors)}`)
    }

    logger.debug(`Found ${tracks.length} tracks for ${JSON.stringify(details)}`)

    try {
      combinedErrors.concat(errors)
      logger.debug(`Processing ${tracks.length} tracks`)
      await addStoreTracksToUsers(storeUrl, tracks, users, sourceId)
    } catch (e) {
      const error = [`Failed to add label tracks to users`, { error: e.toString(), tracks, details }]
      combinedErrors.push(error)
      logger.error(`${error[0]}, error: ${JSON.stringify(error[1]).substring(0, 800)}, stack: ${e.stack}`)
    }
  }

  if (combinedErrors.length === 0) {
    try {
      await setLabelUpdated(details.storeLabelId)
    } catch (e) {
      logger.error('Error setting label updated')
    }
  }

  logger.debug(`Processing tracks for label: ${details.url} done. Errors: ${JSON.stringify(combinedErrors)}`)

  return combinedErrors
}

module.exports.updatePlaylistTracks = async (storeUrl, details, sourceId) => {
  const err = []
  const storeModule = getStoreModule(storeUrl)
  const users = await getUsersFollowingPlaylist(details.playlistId)

  const generator = await storeModule.logic.getPlaylistTracks(details)
  for await (const { tracks, errors } of generator) {
    err.concat(errors)
    try {
      await addStoreTracksToUsers(storeUrl, tracks, users, sourceId)
    } catch (e) {
      const error = [`Failed to add playlist tracks to users`, { error: e.toString(), tracks, sourceId, details }]
      err.push(error)
      logger.error(`${error[0]}, error: ${JSON.stringify(error[1]).substring(0, 800)}, stack: ${e.stack}`)
    }
  }

  if (err.length === 0) {
    await setPlaylistUpdated(details.playlistId)
  }

  return err
}

module.exports.getTracksForStoreIds = queryTracksForStoreIds
module.exports.getTrackDetails = queryTrackDetails

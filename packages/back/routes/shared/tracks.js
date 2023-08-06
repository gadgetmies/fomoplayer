const pg = require('../../db/pg.js')
const sql = require('sql-template-strings')
const { setArtistUpdated, setPlaylistUpdated, setLabelUpdated } = require('./db/watch')
const { modules: storeModules } = require('../stores/index.js')
const { using } = require('bluebird')
const { removeIgnoredTracksFromUsers } = require('../shared/db/user')
const logger = require('../../logger')(__filename)

const { addStoreTrack, ensureArtistExists, ensureReleaseExists, ensureLabelExists } = require('../shared/db/store')

const {
  addPurchasedStoreTrackToUser,
  addTrackToUser: addTrackToUserDb,
  artistOnLabelInIgnore
} = require('../users/db.js')
const { apiURL } = require('../../config.js')
const { queryTracksForStoreIds, queryTrackDetails } = require('./db/tracks')
const { queryLabelForRelease } = require('./db/release')

const getUsersFollowingArtist = async storeArtistId => {
  const [{ users }] = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`--getUsersFollowingArtist
SELECT
  ARRAY_AGG(meta_account_user_id) AS users
FROM
  store__artist_watch__user
  NATURAL JOIN store__artist_watch
WHERE
  store__artist_id = ${storeArtistId}`
  )

  return users
}

const getUsersFollowingLabel = async storeLabelId => {
  const [{ users }] = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`--getUsersFollowingLabel
SELECT
  ARRAY_AGG(meta_account_user_id) AS users
FROM
  store__label_watch__user
  NATURAL JOIN store__label_watch
WHERE
  store__label_id = ${storeLabelId}`
  )

  return users
}

const getUsersFollowingPlaylist = async playlistId => {
  const [{ users }] = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`--getUsersFollowingArtist
SELECT
  ARRAY_AGG(meta_account_user_id) AS users
FROM
  user__playlist_watch
WHERE
  playlist_id = ${playlistId}`
  )

  return users
}

const getStoreModule = function(storeUrl) {
  const module = Object.values(storeModules).find(module => module.logic.storeUrl === storeUrl)
  if (!module) {
    throw new Error('Store not found for url')
  }

  return module
}

const addStoreTracksToUsers = (module.exports.addStoreTracksToUsers = async (
  storeUrl,
  tracks,
  userIds,
  type,
  sourceId
) => {
  logger.debug('Start processing received tracks', { userIds })

  let addedTracks = []
  for (const track of tracks) {
    const trackId = await addStoreTrackToUsers(storeUrl, userIds, track, sourceId, type)
    addedTracks.push(`${apiURL}/tracks/${trackId}`)
  }

  await using(pg.getTransaction(), async tx => {
    await removeIgnoredTracksFromUsers(tx, userIds)
  })

  return addedTracks
})

const addTrackToUser = (module.exports.addTrackToUser = async (tx, userId, artists, trackId, labelId, sourceId) => {
  if (await artistOnLabelInIgnore(tx, userId, artists, labelId)) {
    logger.debug('One of the artists ignored on label by user, skipping', { userId, artists, labelId })
  } else {
    await addTrackToUserDb(tx, userId, trackId, sourceId)
  }
})

const aYear = 1000 * 60 * 60 * 24 * 30 * 12
const addStoreTrackToUsers = async (storeUrl, userIds, track, sourceId, type = 'tracks') => {
  return using(pg.getTransaction(), async tx => {
    let labelId
    let releaseId

    if (track.release) {
      releaseId = await ensureReleaseExists(tx, storeUrl, track.release, sourceId)
    }

    if (releaseId) {
      labelId = await queryLabelForRelease(tx, releaseId)
    } else if (track.label) {
      labelId = (await ensureLabelExists(tx, storeUrl, track.label, sourceId)).labelId
    }

    let artists = []
    for (const artist of track.artists) {
      // TODO: match by release / isrc
      const res = await ensureArtistExists(tx, storeUrl, artist, sourceId)
      artists.push(res)
    }

    const trackId = await addStoreTrack(tx, storeUrl, labelId, releaseId, artists, track, sourceId)

    if (Date.now() - new Date(track.published) < aYear) {
      for (const userId of userIds) {
        await addTrackToUser(tx, userId, artists, trackId, labelId, sourceId)

        if (type === 'purchased') {
          await addPurchasedStoreTrackToUser(tx, userId, track)
        }
      }
    }
    // TODO: Update materialized views

    return trackId
  })
}

module.exports.updateArtistTracks = async (storeUrl, details, sourceId) => {
  const storeModule = getStoreModule(storeUrl)
  const users = await getUsersFollowingArtist(details.storeArtistId)
  const generator = await storeModule.logic.getArtistTracks(details)
  let combinedErrors = []

  logger.debug(`Processing tracks for artist: ${details.url}`)
  for await (const { tracks, errors } of generator) {
    logger.debug(`Found ${tracks.length} tracks for ${JSON.stringify(details)}`)
    try {
      combinedErrors.concat(errors)
      logger.debug(`Processing ${tracks.length} tracks`)
      await addStoreTracksToUsers(storeUrl, tracks, users, 'tracks', sourceId)
    } catch (e) {
      const error = [`Failed to add artist tracks to users`, { error: e.toString(), details }]
      combinedErrors.push(error)
      logger.error(...error)
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
  } catch (e) {
    const error = ['Error fetching user follows for label', { error: e.toString(), storeId, details }]
    logger.error(...error)
    return [error]
  }
  const generator = storeModule.logic.getLabelTracks(details)

  logger.debug(`Processing tracks for label: ${details.url}`)
  let combinedErrors = []
  for await (const { tracks, errors } of generator) {
    try {
      combinedErrors.concat(errors)
      logger.debug(`Processing ${tracks.length} tracks`)
      await addStoreTracksToUsers(storeUrl, tracks, users, sourceId)
    } catch (e) {
      const error = [`Failed to add label tracks to users`, { error: e.toString(), tracks, details }]
      combinedErrors.push(error)
      logger.error(...error)
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
      const error = [`Failed to add playlist tracks to users`, { error: e.toString(), tracks, details }]
      err.push(error)
      logger.error(...error)
    }
  }

  if (err.length === 0) {
    await setPlaylistUpdated(details.playlistId)
  }

  return err
}

module.exports.getTracksForStoreIds = queryTracksForStoreIds
module.exports.getTrackDetails = queryTrackDetails

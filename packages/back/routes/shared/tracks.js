const pg = require('../../db/pg.js')
const sql = require('sql-template-strings')
const { addStoreTrackToUsers } = require('../users/shared')
const { setArtistUpdated, setPlaylistUpdated, setLabelUpdated } = require('./db/watch')
const { modules: storeModules } = require('../stores/index.js')
const logger = require('../../logger')(__filename)

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

module.exports.updateArtistTracks = async (storeUrl, details, sourceId) => {
  logger.info('updateArtistTracks', { storeUrl, details, sourceId })
  const storeModule = getStoreModule(storeUrl)
  const users = await getUsersFollowingArtist(details.storeArtistId)
  const { tracks, errors } = await storeModule.logic.getArtistTracks(details)
  for (const track of tracks) {
    try {
      await addStoreTrackToUsers(storeUrl, users, track, sourceId)
    } catch (e) {
      const error = [`Failed to add artist tracks to users`, { error: e.toString(), track, details }]
      errors.push(error)
      logger.error(...error)
    }
  }

  if (errors.length === 0) {
    await setArtistUpdated(details.storeArtistId)
  }

  return errors
}

module.exports.updateLabelTracks = async (storeUrl, details, sourceId) => {
  logger.info(`Updating label tracks: ${details.url}`)
  const storeModule = getStoreModule(storeUrl)
  const users = await getUsersFollowingLabel(details.storeLabelId)

  const { tracks, errors } = await storeModule.logic.getLabelTracks(details)
  logger.info(`Found ${tracks.length} tracks for label: ${details.url}`)
  for (const track of tracks) {
    try {
      await addStoreTrackToUsers(storeUrl, users, track, sourceId)
    } catch (e) {
      const error = [`Failed to add label tracks to users`, { error: e.toString(), track, details }]
      errors.push(error)
      logger.error(...error)
    }
  }

  if (errors.length === 0) {
    await setLabelUpdated(details.storeLabelId)
  }

  return errors
}

module.exports.updatePlaylistTracks = async (storeUrl, details, sourceId) => {
  const err = []
  const storeModule = getStoreModule(storeUrl)
  const users = await getUsersFollowingPlaylist(details.playlistId)

  const generator = await storeModule.logic.getPlaylistTracks(details)
  for await (const { tracks, errors } of generator) {
    err.concat(errors)
    for (const track of tracks) {
      try {
        await addStoreTrackToUsers(storeUrl, users, track, sourceId)
      } catch (e) {
        const error = [`Failed to add playlist tracks to users`, { error: e.toString(), track, details }]
        errors.push(error)
        logger.error(...error)
      }
    }
  }

  if (err.length === 0) {
    await setPlaylistUpdated(details.playlistId)
  }

  return err
}

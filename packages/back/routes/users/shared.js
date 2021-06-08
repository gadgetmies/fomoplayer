const { using } = require('bluebird')
const pg = require('../../db/pg.js')
const logger = require('../../logger')(__filename)

const { addStoreTrack, ensureArtistExists, ensureReleaseExists, ensureLabelExists } = require('../shared/db/store')

const { addPurchasedTrackToUser, addTrackToUser: addTrackToUserDb, artistOnLabelInIgnore } = require('./db')

const addTrackToUser = module.exports.addTrackToUser = async (tx, userId, artists, trackId, labelId, sourceId) => {
  if (await artistOnLabelInIgnore(tx, userId, artists, labelId)) {
    logger.info('One of the artists ignored on label by user, skipping', { userId, artists, labelId })
  } else {
    await addTrackToUserDb(tx, userId, trackId, sourceId)
  }
}

module.exports.addStoreTrackToUsers = async (storeUrl, userIds, track, sourceId, type = 'tracks') => {
  logger.debug('addStoreTrackToUsers', { storeUrl, userIds, track, sourceId, type })
  return using(pg.getTransaction(), async tx => {
    let labelId
    let releaseId

    if (track.label) {
      labelId = (await ensureLabelExists(tx, storeUrl, track.label, sourceId)).labelId
    }

    if (track.release) {
      releaseId = await ensureReleaseExists(tx, storeUrl, track.release, sourceId)
    }

    let artists = []
    for (const artist of track.artists) {
      const res = await ensureArtistExists(tx, storeUrl, artist, sourceId)
      artists.push(res)
    }

    const trackId = await addStoreTrack(tx, storeUrl, labelId, releaseId, artists, track, sourceId)

    for (const userId of userIds) {
      await addTrackToUser(tx, userId, artists, trackId, labelId, sourceId)

      if (type === 'purchased') {
        await addPurchasedTrackToUser(tx, userId, track)
      }
    }
    // TODO: Update materialized views

    return trackId
  })
}

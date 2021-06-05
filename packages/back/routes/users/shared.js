const { using } = require('bluebird')
const pg = require('../../db/pg.js')
const logger = require('../../logger')(__filename)

const { addStoreTrack, ensureArtistExists, ensureReleaseExists, ensureLabelExists } = require('../shared/db/store')

const { addPurchasedTrackToUser, addTrackToUser } = require('./db')

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
      await addTrackToUser(tx, userId, trackId, sourceId)

      if (type === 'purchased') {
        await addPurchasedTrackToUser(tx, userId, track)
      }
    }
    // TODO: Update materialized views

    return trackId
  })
}

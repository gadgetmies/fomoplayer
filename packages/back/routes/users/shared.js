const { using } = require('bluebird')
const pg = require('../../db/pg.js')

const { addStoreTrack, ensureArtistExists, ensureReleaseExists, ensureLabelExists } = require('../shared/db/store')

const { addPurchasedTrackToUser, addTrackToUser } = require('./db')

module.exports.addStoreTrackToUsers = async (storeUrl, userIds, track, source, type = 'tracks') => {
  return using(pg.getTransaction(), async tx => {
    let labelId
    let releaseId

    if (track.label) {
      labelId = (await ensureLabelExists(tx, storeUrl, track.label, source)).labelId
    }

    if (track.release) {
      releaseId = await ensureReleaseExists(tx, storeUrl, track.release, source)
    }

    let artists = []
    for (const artist of track.artists) {
      const res = await ensureArtistExists(tx, storeUrl, artist, source)
      artists.push(res)
    }

    const trackId = await addStoreTrack(tx, storeUrl, labelId, releaseId, artists, track, source)

    for (const userId of userIds) {
      await addTrackToUser(tx, userId, trackId, source)

      if (type === 'purchased') {
        await addPurchasedTrackToUser(tx, userId, track)
      }
    }
    // TODO: Update materialized views

    return trackId
  })
}

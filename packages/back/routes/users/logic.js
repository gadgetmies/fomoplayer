const { using, each } = require('bluebird')
const R = require('ramda')
const pg = require('../../db/pg.js')

const { addStoreTrack, ensureArtistExists, ensureReleaseExists, ensureLabelExists } = require('../shared/db/store')

const {
  addArtistOnLabelToIgnore,
  addArtistWatch,
  addLabelWatch,
  addPurchasedTrackToUser,
  addTrackToUser,
  deletePlaylistFollowFromUser,
  queryUserArtistFollows,
  queryUserLabelFollows,
  queryUserPlaylistFollows,
  queryUserTracks,
  deleteArtistWatchesFromUser,
  deleteArtistWatchFromUser,
  deleteLabelWatchesFromUser,
  deleteLabelWatchFromUser,
  setAllHeard,
  setTrackHeard
} = require('./db')

module.exports.getUserTracks = queryUserTracks
module.exports.getUserArtistFollows = queryUserArtistFollows
module.exports.getUserLabelFollows = queryUserLabelFollows
module.exports.getUserPlaylistFollows = queryUserPlaylistFollows

const { removeIgnoredTracksFromUser } = require('../shared/db/user.js')

module.exports.queryUserTracks = queryUserTracks
module.exports.getTracksM3u = username =>
  queryUserTracks(username).then(userTracks => {
    return (
      '[playlist]\n\n' +
      userTracks
        .map(R.path(['previews', 0, 'url']))
        .map((row, i) => `File${i + 1}=${row}\nLength${i + 1}=5`)
        .join('\n\n')
        .concat(`\n\nNumberOfEntries=${userTracks.length}\nVersion=2\n`)
    )
  })

module.exports.setTrackHeard = setTrackHeard
module.exports.setAllHeard = setAllHeard

module.exports.addArtistOnLabelToIgnore = addArtistOnLabelToIgnore
module.exports.addArtistsOnLabelsToIgnore = (username, { artistIds, labelIds }) =>
  using(pg.getTransaction(), tx =>
    each(R.xprod(artistIds, labelIds), ([artistId, labelId]) =>
      addArtistOnLabelToIgnore(tx, artistId, labelId, username).tap(() => removeIgnoredTracksFromUser(tx, username))
    )
  )

module.exports.addStoreTrackToUsers = async (storeUrl, userIds, track, type) => {
  return using(pg.getTransaction(), async tx => {
    let labelId
    let releaseId

    if (track.label) {
      labelId = await ensureLabelExists(tx, storeUrl, track.label)
    }
    if (track.release) {
      releaseId = await ensureReleaseExists(tx, storeUrl, track.release)
    }

    let artists = []
    for (const artist of track.artists) {
      const res = await ensureArtistExists(tx, storeUrl, artist)
      artists.push(res)
    }

    const trackId = await addStoreTrack(tx, storeUrl, labelId, releaseId, artists, track)

    for (const userId of userIds) {
      await addTrackToUser(tx, userId, trackId)

      if (type === 'purchased') {
        await addPurchasedTrackToUser(tx, userId, track)
      }
    }
    // TODO: Update materialized views

    return trackId
  })
}

module.exports.removeArtistWatchesFromUser = deleteArtistWatchesFromUser
module.exports.removeArtistWatchFromUser = deleteArtistWatchFromUser
module.exports.removeLabelWatchesFromUser = deleteLabelWatchesFromUser
module.exports.removeLabelWatchFromUser = deleteLabelWatchFromUser

module.exports.addStoreArtistToUser = async (storeUrl, user, artist) => {
  return using(pg.getTransaction(), async tx => {
    const { id } = await ensureArtistExists(tx, storeUrl, artist)
    await addArtistWatch(tx, user.id, id)
    return id
  })
}

module.exports.addStoreLabelToUser = async (storeUrl, user, label) => {
  return using(pg.getTransaction(), async tx => {
    const labelId = await ensureLabelExists(tx, storeUrl, label)
    await addLabelWatch(tx, user.id, labelId)
    return labelId
  })
}

module.exports.removePlaylistFollowFromUser = async (userId, playlistId) =>
  deletePlaylistFollowFromUser(userId, playlistId)

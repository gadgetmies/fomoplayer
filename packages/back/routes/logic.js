const BPromise = require('bluebird')
const pg = require('../db/pg.js')
const { apiURL } = require('../config.js')
const R = require('ramda')

const {
  addTrackToUser,
  ensureReleaseExists,
  ensureArtistExists,
  ensureLabelExists,
  addStoreTrack,
  addPurchasedTrackToUser,
  queryUserTracks,
  addArtistOnLabelToIgnore,
  setTrackHeard,
  setAllHeard,
  getLongestPreviewForTrack,
  addArtistWatch,
  addLabelWatch,
  removeArtistWatchesFromUser,
  removeLabelWatchesFromUser
} = require('./db.js')

const removeIgnoredTracksFromUser = require('../remove-ignored-tracks-from-user.js')

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
  BPromise.using(pg.getTransaction(), tx =>
    BPromise.each(R.xprod(artistIds, labelIds), ([artistId, labelId]) =>
      addArtistOnLabelToIgnore(tx, artistId, labelId, username).tap(() => removeIgnoredTracksFromUser(tx, username))
    )
  )

module.exports.getStorePreviewRedirectForTrack = async (id, format, skip) => {
  const { storeCode, storeTrackId } = await getLongestPreviewForTrack(id, format, skip)
  return `${apiURL}/stores/${storeCode}/tracks/${storeTrackId}/preview.${format}`
}

module.exports.addStoreTrackToUsers = async (storeUrl, userIds, track, type) => {
  let labelId
  let releaseId

  if (track.label) {
    labelId = await ensureLabelExists(storeUrl, track.label)
  }
  if (track.release) {
    releaseId = await ensureReleaseExists(storeUrl, track.release)
  }

  let artists = []
  for (const artist of track.artists) {
    const res = await ensureArtistExists(storeUrl, artist)
    artists.push(res)
  }

  const trackId = await addStoreTrack(storeUrl, labelId, releaseId, artists, track)

  for (const userId of userIds) {
    await addTrackToUser(userId, trackId)

    if (type === 'purchased') {
      await addPurchasedTrackToUser(userId, track)
    }
  }
  // TODO: Update materialized views

  return trackId
}

module.exports.removeArtistWatchesFromUser = removeArtistWatchesFromUser
module.exports.removeLabelWatchesFromUser = removeLabelWatchesFromUser

module.exports.addStoreArtistToUser = async (storeUrl, user, artist) => {
  const { id } = await ensureArtistExists(storeUrl, artist)
  await addArtistWatch(user.id, id)
  return id
}

module.exports.addStoreLabelToUser = async (storeUrl, user, label) => {
  const labelId = await ensureLabelExists(storeUrl, label)
  await addLabelWatch(user.id, labelId)
  return labelId
}

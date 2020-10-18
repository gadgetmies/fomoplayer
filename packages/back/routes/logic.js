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
  addPurchasedTrackToUser
} = require('./db.js')

const removeIgnoredTracksFromUser = require('../remove-ignored-tracks-from-user.js')
const {
  queryUserTracks,
  addArtistOnLabelToIgnore,
  setTrackHeard,
  setAllHeard,
  getLongestPreviewForTrack
} = require('./db.js')

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
  return `/api/stores/${storeCode}/tracks/${storeTrackId}/preview.${format}`
}

module.exports.addStoreTrackToUser = async (storeUrl, user, track, type) => {
  let labelId
  let releaseId

  if (track.label) {
    labelId = await ensureLabelExists(storeUrl, track.label)
  }
  if (track.release) {
    releaseId = await ensureReleaseExists(storeUrl, track.release)
  }
  const artists = await Promise.all(track.artists.map(artist => ensureArtistExists(storeUrl, artist)))

  const trackId = await addStoreTrack(storeUrl, labelId, releaseId, artists, track)

  await addTrackToUser(user.id, trackId)

  if (type === 'purchased') {
    await addPurchasedTrackToUser(user.id, track.id)
  }
  // TODO: Update materialized views

  return trackId
}

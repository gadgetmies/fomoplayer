const BPromise = require('bluebird')
const pg = require('../db/pg.js')
const { apiRoot } = require('../config.js')
const R = require('ramda')

const { getTrackIdForStoreTrack, addTrackToUser, ensureReleaseExists, ensureArtistExists, ensureLabelExists, addStoreTrack } = require('./db.js')

const removeIgnoredTracksFromUser = require('../remove-ignored-tracks-from-user.js')
const { queryUserTracks, addArtistOnLabelToIgnore, setTrackHeard, setAllHeard, getLongestPreviewForTrack } =
  require('./db.js')

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

module.exports.getStorePreviewRedirectForTrack = (id, format, skip) =>
  getLongestPreviewForTrack(id, format, skip)
    .then(({ storeCode, storeTrackId }) => `${apiRoot}/stores/${storeCode}/tracks/${storeTrackId}/preview.${format}`)

module.exports.addStoreTrackToUser = async (storeUrl, user, track) => {
  console.log(track)
  let trackId = await getTrackIdForStoreTrack(storeUrl, track.id)

  if (!trackId) {
    let labelId
    let releaseId

    if (track.label) {
      labelId = await ensureLabelExists(storeUrl, track.label)
    }
    if (track.release) {
      releaseId = await ensureReleaseExists(storeUrl, track.release)
    }
    const artists = await Promise.all(track.artists.map(artist => ensureArtistExists(storeUrl, artist)))

    trackId = await addStoreTrack(storeUrl, labelId, releaseId, artists, track)
  }

  return addTrackToUser(user, trackId)
}

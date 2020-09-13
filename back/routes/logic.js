const BPromise = require('bluebird')
const pg = require('../db/pg.js')

const removeIgnoredTracksFromUser = require('../remove-ignored-tracks-from-user.js')
const { queryUserTracks, addArtistOnLabelToIgnore, setTrackHeard, getLongestPreviewForTrack } = require('./db.js')

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

module.exports.addArtistOnLabelToIgnore = addArtistOnLabelToIgnore
module.exports.addArtistsOnLabelsToIgnore = (username, artistsAndLabels) =>
  BPromise.using(pg.getTransaction(), tx =>
    BPromise.each(artistsAndLabels, ({ artistId, labelId }) =>
      addArtistOnLabelToIgnore(tx, artistId, labelId, username).tap(() => removeIgnoredTracksFromUser(tx, username))
    )
  )

module.exports.getStorePreviewRedirectForTrack = (id, format) =>
  getLongestPreviewForTrack(id, format)
    .then(({storeCode, storeTrackId}) => `/stores/${storeCode}/tracks/${storeTrackId}/preview.${format}`)
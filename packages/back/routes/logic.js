const { apiURL } = require('../config.js')
const { getLongestPreviewForTrack, searchForTracks } = require('./db.js')
const { modules: storeModules } = require('./stores/index.js')

module.exports.getStorePreviewRedirectForTrack = async (id, format, skip) => {
  const { storeCode, storeTrackId } = await getLongestPreviewForTrack(id, format, skip)
  return `${apiURL}/stores/${storeCode}/tracks/${storeTrackId}/preview.${format}`
}

module.exports.getLongestPreviewForTrack = getLongestPreviewForTrack
module.exports.searchForTracks = searchForTracks
module.exports.getFollowDetails = async url => {
  for (const storeModule of Object.values(storeModules)) {
    const details = await storeModule.logic.getFollowDetails(url)
    if (details !== undefined) {
      return details
    }
  }
}

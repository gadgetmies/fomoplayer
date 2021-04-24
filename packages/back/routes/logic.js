const { apiURL } = require('../config.js')
const { queryLongestPreviewForTrack, searchForTracks } = require('./db.js')
const { queryPreviewDetails } = require('./shared/db/preview')
const { modules: storeModules } = require('./stores/index.js')

module.exports.getStorePreviewRedirectForTrack = async (id, format, skip) => {
  const { storeCode, storeTrackId } = await queryLongestPreviewForTrack(id, format, skip)
  return `${apiURL}/stores/${storeCode}/tracks/${storeTrackId}/preview.${format}`
}

module.exports.searchForTracks = searchForTracks
module.exports.getFollowDetails = async url => {
  for (const storeModule of Object.values(storeModules)) {
    const details = await storeModule.logic.getFollowDetails(url)
    if (details !== undefined) {
      return details
    }
  }
}

module.exports.getPreview = async (id, format, offset) => {
  const { url, previewId } = await queryLongestPreviewForTrack(id, format, offset)
  if (url !== null) {
    return url
  } else {
    return (await queryPreviewDetails(previewId)).url
  }
}

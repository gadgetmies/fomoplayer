const { apiURL } = require('../config.js')

const {
  getLongestPreviewForTrack,
} = require('./db.js')

module.exports.getStorePreviewRedirectForTrack = async (id, format, skip) => {
  const { storeCode, storeTrackId } = await getLongestPreviewForTrack(id, format, skip)
  return `${apiURL}/stores/${storeCode}/tracks/${storeTrackId}/preview.${format}`
}

module.exports.getLongestPreviewForTrack = getLongestPreviewForTrack

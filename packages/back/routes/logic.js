const { apiURL } = require('../config.js')
const { queryLongestPreviewForTrack, searchForArtistsAndLabels } = require('./db.js')
const { searchForTracks } = require('./shared/db/search.js')
const { queryPreviewDetails } = require('./shared/db/preview')
const { queryCartDetails, queryCartOwner } = require('./shared/db/cart')
const { queryCartDetailsByUuid, verifyEmail, queryEmbedding } = require('./db')
const { getStoreDetailsFromUrl } = require('./stores/logic')
const { modules: storeModules } = require('./stores/store-modules')
const { queryEntityDetails } = require('./shared/db/entities')
const logger = require('fomoplayer_shared').logger(__filename)
const { make, encodePNGToStream } = require('pureimage')
const converter = require('hsl-to-rgb-for-reals')

module.exports.getStorePreviewRedirectForTrack = async (id, format, skip) => {
  const { storeCode, storeTrackId } = await queryLongestPreviewForTrack(id, format, skip)
  return `${apiURL}/stores/${storeCode}/tracks/${storeTrackId}/preview.${format}`
}

module.exports.searchForTracks = searchForTracks

module.exports.getFollowDetails = async (query, stores) => {
  let details
  if (query.match('^https://') !== null) {
    let detailsFromURL
    try {
      detailsFromURL = await getStoreDetailsFromUrl(query, stores)
    } catch (e) {
      return []
    }
    if (!stores.includes(detailsFromURL.storeName)) {
      return []
    }
    details = await storeModules[detailsFromURL.storeName].logic.getFollowDetails(detailsFromURL)
  } else {
    details = await searchForArtistsAndLabels(query, stores)
  }
  if (details.length > 0) {
    return details
  }

  return []
}

module.exports.getPreview = async (id, stores, format, offset) => {
  const { url, previewId } = await queryLongestPreviewForTrack(id, stores, format, offset)
  if (url !== null) {
    return url
  } else {
    return (await queryPreviewDetails(previewId))[0].url
  }
}

module.exports.getCartDetails = async (uuid, userId, stores = undefined, tracksFilter) => {
  logger.info(`Getting cart details for user: ${userId}, uuid: ${uuid}`)
  const { isPublic, id } = await queryCartDetailsByUuid(uuid)
  logger.info(`Cart is public: ${isPublic}, id: ${id}`)
  const [{ ownerUserId }] = await queryCartOwner(id)
  logger.info(`Cart owner: ${ownerUserId}`)
  if (!isPublic && ownerUserId !== userId) {
    return null
  }
  return await queryCartDetails(id, stores, tracksFilter)
}

module.exports.getEntityDetails = queryEntityDetails

module.exports.verifyEmail = verifyEmail

const embeddingLength = 1280

module.exports.getEmbeddingImage = async (id, stream) => {
  try {
    const embedding = await queryEmbedding(id)
    if (!embedding) return false
    const embeddingVector = JSON.parse(embedding)
    const canvas = make(embeddingVector.length, 10, {})
    const ctx = canvas.getContext('2d')
    const max = Math.max(...embeddingVector)
    const min = Math.min(...embeddingVector)
    for (let i = 0; i < embeddingLength; ++i) {
      const normalizedValue = (embeddingVector[i] - min) / (max - min)
      const color = converter((100 * normalizedValue + 270) % 360, 1, 0.5)
      ctx.fillStyle = `#${color.map(i => (i || 0).toString(16).padStart(2, '0')).join('')}`
      ctx.fillRect(i, 0, 1, canvas.height)
    }
    await encodePNGToStream(canvas, stream)
    return true
  } catch (e) {
    logger.error(e)
    return false
  }
}

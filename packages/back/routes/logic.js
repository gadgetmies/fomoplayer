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
const { createCanvas } = require('canvas')

module.exports.getStorePreviewRedirectForTrack = async (id, format, skip) => {
  const { storeCode, storeTrackId } = await queryLongestPreviewForTrack(id, format, skip)
  return `${apiURL}/stores/${storeCode}/tracks/${storeTrackId}/preview.${format}`
}

module.exports.searchForTracks = searchForTracks
module.exports.getFollowDetails = async (query, store) => {
  let details
  if (query.match('^https://') !== null) {
    let detailsFromURL
    try {
      detailsFromURL = await getStoreDetailsFromUrl(query)
    } catch (e) {
      return []
    }
    details = await storeModules[store || detailsFromURL.storeName].logic.getFollowDetails(detailsFromURL)
  } else {
    details = await searchForArtistsAndLabels(query, store)
  }
  if (details.length > 0) {
    return details
  }

  return []
}

module.exports.getPreview = async (id, store, format, offset) => {
  const { url, previewId } = await queryLongestPreviewForTrack(id, store, format, offset)
  if (url !== null) {
    return url
  } else {
    return (await queryPreviewDetails(previewId))[0].url
  }
}

module.exports.getCartDetails = async (uuid, userId, store = undefined, tracksFilter) => {
  logger.info(`Getting cart details for user: ${userId}, uuid: ${uuid}`)
  const { isPublic, id } = await queryCartDetailsByUuid(uuid)
  logger.info(`Cart is public: ${isPublic}, id: ${id}`)
  const [{ ownerUserId }] = await queryCartOwner(id)
  logger.info(`Cart owner: ${ownerUserId}`)
  if (!isPublic && ownerUserId !== userId) {
    return null
  }
  return await queryCartDetails(id, store, tracksFilter)
}

module.exports.getEntityDetails = queryEntityDetails

module.exports.verifyEmail = verifyEmail

const embeddingLength = 1280
const gradient = new Array(100).fill(null).map((_, i, arr) => `hsl(${Math.round(40 + 300 * (i / arr.length))} 100% 50%)`)

module.exports.getEmbeddingImage = async (id) => {
  const embedding = await queryEmbedding(id)
  if (!embedding) return
  const embeddingVector = JSON.parse(embedding)
  const canvas = createCanvas(embeddingVector.length, 10)
  const ctx = canvas.getContext('2d')
  for (let i = 0; i < embeddingLength; ++i) {
    ctx.fillStyle = gradient[Math.round((embeddingVector[i] + 1) * 100)]
    ctx.fillRect(i, 0, 1, canvas.height)
  }
  return canvas.createPNGStream()
}

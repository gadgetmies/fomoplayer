const {
  queryUserCartDetails,
  queryUserCartDetailsWithTracks,
  insertCart,
  deleteCart,
  queryCartDetails,
  updateCartProperties,
  insertTracksToCart,
  deleteTracksFromCart,
  queryDefaultCartId,
  queryCartOwner,
  insertCartStoreDetails,
  deleteCartStoreDetails,
  queryCartStoreDetails
} = require('./db/cart.js')
const { using } = require('bluebird')
const pg = require('../../db/pg')
const R = require('ramda')
const { NotFound, Forbidden } = require('./httpErrors')
const {
  addTracksToSyncedCart,
  removeTracksFromSyncedCart,
  createCart,
  storeName: spotifyStoreName
} = require('./spotify')
const { getTrackDetails } = require('./tracks')
const { updateCartStoreVersionId, deleteUserCartStoreDetails } = require('./db/cart')
const logger = require('../../logger')(__filename)

module.exports.getUserCarts = queryUserCartDetails
module.exports.getUserCartsWithTracks = queryUserCartDetailsWithTracks
module.exports.createCart = insertCart
module.exports.removeCart = async (userId, cartId) => {
  await verifyCartOwnership(userId, cartId)
  await deleteCart(cartId)
}

module.exports.updateCartDetails = async (userId, cartId, properties) => {
  await verifyCartOwnership(userId, cartId)
  const { name, is_public } = properties
  await using(pg.getTransaction(), async tx => {
    if (name !== undefined && is_public !== undefined) {
      await updateCartProperties(tx, cartId, properties)
    } else {
      throw new Error(`Missing cart details (name, is_public), provided: ${JSON.stringify(properties, null, 2)}`)
    }
  })
}

const getCartStoreDetails = async (cartId, storeName) => {
  const cartStoreDetails = await queryCartStoreDetails(cartId)
  return cartStoreDetails.find(({ storeName: cartStoreName }) => cartStoreName === storeName)
}

const addTracksToCart = (module.exports.addTracksToCart = async (userId, cartId, trackIds) => {
  await verifyCartOwnership(userId, cartId)
  await insertTracksToCart(cartId, trackIds)
  const spotifyCartDetails = await getCartStoreDetails(cartId, spotifyStoreName)
  if (spotifyCartDetails) {
    const trackDetails = await getTrackDetails(trackIds)
    const updatedVersionId = await addTracksToSyncedCart(userId, trackDetails, spotifyCartDetails)
    if (updatedVersionId) {
      await updateCartStoreVersionId(cartId, updatedVersionId)
    }
  }
})

const removeTracksFromCart = (module.exports.removeTracksFromCart = async (userId, cartId, trackIds) => {
  await verifyCartOwnership(userId, cartId)
  await deleteTracksFromCart(cartId, trackIds)
  const spotifyCartDetails = await getCartStoreDetails(cartId, spotifyStoreName)
  if (spotifyCartDetails) {
    const trackDetails = await getTrackDetails(trackIds)
    const updatedVersionId = await removeTracksFromSyncedCart(userId, trackDetails, spotifyCartDetails)
    if (updatedVersionId) {
      await updateCartStoreVersionId(cartId, updatedVersionId)
    }
  }
})

module.exports.updateCartContents = async (userId, cartId, operations) => {
  const tracksToBeRemoved = operations.filter(R.propEq('op', 'remove')).map(R.prop('trackId'))
  const tracksToBeAdded = operations.filter(R.propEq('op', 'add')).map(R.prop('trackId'))

  if (tracksToBeRemoved.length > 0) {
    await removeTracksFromCart(userId, cartId, tracksToBeRemoved)
  }
  if (tracksToBeAdded.length > 0) {
    await addTracksToCart(userId, cartId, tracksToBeAdded)
  }
}

module.exports.updateAllCartContents = async (userId, operations) => {
  const tracksToBeRemoved = operations.filter(R.propEq('op', 'remove')).map(R.prop('trackId'))
  const tracksToBeAdded = operations.filter(R.propEq('op', 'add')).map(R.prop('trackId'))

  const carts = await queryUserCartDetails(userId)
  for (const { id } of carts) {
    await removeTracksFromCart(userId, id, tracksToBeRemoved)
    await addTracksToCart(userId, id, tracksToBeAdded)
  }
}

const verifyCartOwnership = async (userId, cartId) => {
  const rows = await queryCartOwner(cartId)
  if (rows.length === 0) {
    throw new NotFound(`Cart with id ${cartId} not found!`)
  } else if (rows[0].ownerUserId !== userId) {
    throw new Forbidden('Cart owner does not match the session user!')
  }
}

module.exports.getCartDetails = async (userId, cartId) => {
  let realCartId = cartId
  if (cartId === 'default') {
    realCartId = await queryDefaultCartId(userId)
  } else {
    await verifyCartOwnership(userId, realCartId)
  }
  return await queryCartDetails(realCartId)
}

module.exports.insertCartStoreDetails = insertCartStoreDetails
module.exports.deleteCartStoreDetails = deleteCartStoreDetails
module.exports.deleteUserCartStoreDetails = deleteUserCartStoreDetails

module.exports.enableCartSync = async (userId, cartId, storeName) => {
  try {
    const { name, tracks } = await queryCartDetails(cartId)
    const { id: spotifyPlaylistId, url, versionId } = await createCart(userId, `Fomo Player: ${name}`, tracks)
    await insertCartStoreDetails(cartId, storeName, spotifyPlaylistId, url, versionId)
  } catch (e) {
    logger.error(`Enabling cart sync failed for user: ${userId}, cart: ${cartId}`)
    logger.error(e)
    throw e
  }
}

module.exports.removeCartSync = async (userId, cartId, storeName) => {
  await deleteCartStoreDetails(cartId, storeName)
}

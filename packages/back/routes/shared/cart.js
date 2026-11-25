const {
  queryUserCartDetails,
  queryUserCartDetailsWithTracks,
  deleteCart,
  insertCart,
  queryCartDetails,
  updateCartProperties,
  insertTracksToCart,
  deleteTracksFromCart,
  queryCartOwner,
  insertCartStoreDetails,
  deleteCartStoreDetails,
  queryCartStoreDetails,
  queryCartTrackIds,
  queryCartReviewCounts,
  updateCartIsInReview,
  updateCartTrackReviewState,
  queryCartTracksInReviewState,
  restoreTracksToCart,
  REVIEW_STATES,
} = require('./db/cart.js')
const BPromise = require('bluebird')
const pg = require('fomoplayer_shared').db.pg
const R = require('ramda')
const sql = require('sql-template-strings')
const { NotFound, Forbidden, BadRequest } = require('./httpErrors')
const {
  addTracksToSyncedCart,
  removeTracksFromSyncedCart,
  createCart,
  storeName: spotifyStoreName,
} = require('./spotify')
const { getTrackDetails, addStoreTracksToUsers } = require('./tracks')
const { updateCartStoreVersionId, deleteUserCartStoreDetails } = require('./db/cart')
const { getStoreModuleForPlaylistByUrl } = require('./stores')
const logger = require('fomoplayer_shared').logger(__filename)

// Paging of a cart's tracks in the API (`offset`, `limit`).
module.exports.CART_TRACKS_PAGE = { defaultLimit: 200, maxLimit: 500 }

module.exports.getUserCarts = queryUserCartDetails
module.exports.getUserCartsWithTracks = queryUserCartDetailsWithTracks
module.exports.createCart = insertCart
module.exports.removeCart = async (userId, cartId) => {
  await verifyCartOwnership(userId, cartId)
  await deleteCart(cartId)
}

module.exports.updateCartDetails = async (userId, cartId, properties) => {
  await verifyCartOwnership(userId, cartId)
  const { name, isPublic } = properties
  await BPromise.using(pg.getTransaction(), async (tx) => {
    if (name !== undefined || isPublic !== undefined) {
      try {
        await updateCartProperties(tx, cartId, { name, isPublic })
      } catch (e) {
        const error = `Updating cart properties failed, error: ${e.toString()}`
        logger.error(error)
        throw new Error(error)
      }
    } else {
      const message = `Missing cart details (name, isPublic), provided: ${JSON.stringify(properties, null, 2)}`
      logger.error(message)
      throw new Error(message)
    }
  }).catch((e) => {
    logger.error(`Updating cart details failed: ${e.toString()}`)
    throw new Error('Updating cart details failed')
  })
}

const getCartStoreDetails = async (cartId, storeName) => {
  const cartStoreDetails = await queryCartStoreDetails(cartId)
  return cartStoreDetails.find(({ storeName: cartStoreName }) => cartStoreName === storeName)
}

// Adds tracks to the cart's Spotify playlist when the cart is synced to one. Runs after the response.
const syncAddedTracks = (userId, cartId, trackIds) =>
  setImmediate(async () => {
    const spotifyCartDetails = await getCartStoreDetails(cartId, spotifyStoreName)
    if (spotifyCartDetails) {
      const trackDetails = await getTrackDetails(trackIds)
      const updatedVersionId = await addTracksToSyncedCart(userId, trackDetails, spotifyCartDetails)
      if (updatedVersionId) {
        await updateCartStoreVersionId(cartId, updatedVersionId)
      }
    }
  })

// Removes tracks from the cart's Spotify playlist when the cart is synced to one.
const syncRemovedTracks = async (userId, cartId, trackIds) => {
  const spotifyCartDetails = await getCartStoreDetails(cartId, spotifyStoreName)
  if (spotifyCartDetails) {
    const trackDetails = await getTrackDetails(trackIds)
    const updatedVersionId = await removeTracksFromSyncedCart(userId, trackDetails, spotifyCartDetails)
    if (updatedVersionId) {
      await updateCartStoreVersionId(cartId, updatedVersionId)
    }
  }
}

const addTracksToCart = (module.exports.addTracksToCart = async (userId, cartId, items) => {
  await verifyCartOwnership(userId, cartId)
  await insertTracksToCart(cartId, items)
  syncAddedTracks(
    userId,
    cartId,
    items.map((i) => i.trackId),
  )
})

const removeTracksFromCart = (module.exports.removeTracksFromCart = async (userId, cartId, trackIds) => {
  await verifyCartOwnership(userId, cartId)
  await deleteTracksFromCart(cartId, trackIds)
  await syncRemovedTracks(userId, cartId, trackIds)
})

module.exports.updateCartContents = async (userId, cartId, operations) => {
  const tracksToBeRemoved = operations.filter(R.propEq('remove', 'op')).map(R.prop('trackId'))
  const tracksToBeAdded = operations
    .filter(R.propEq('add', 'op'))
    .map(({ trackId, addedAt }) => ({ trackId, addedAt }))

  if (tracksToBeRemoved.length > 0) {
    await removeTracksFromCart(userId, cartId, tracksToBeRemoved)
  }
  if (tracksToBeAdded.length > 0) {
    await addTracksToCart(userId, cartId, tracksToBeAdded)
  }
}

// Makes the cart contain exactly the given tracks. Tracks already in the cart keep their added date.
module.exports.setCartTracks = async (userId, cartId, trackIds) => {
  await verifyCartOwnership(userId, cartId)
  const wanted = new Set(trackIds.map(Number))
  const existing = await queryCartTrackIds(cartId)
  const existingSet = new Set(existing)
  const removed = existing.filter((id) => !wanted.has(id))
  const added = [...wanted].filter((id) => !existingSet.has(id))
  if (removed.length > 0) await removeTracksFromCart(userId, cartId, removed)
  if (added.length > 0) await addTracksToCart(userId, cartId, added.map((trackId) => ({ trackId })))
  return { added: added.length, removed: removed.length }
}

module.exports.updateAllCartContents = async (userId, operations, excludePurchased = true) => {
  const tracksToBeRemoved = operations.filter(R.propEq('remove', 'op')).map(R.prop('trackId'))
  const tracksToBeAdded = operations
    .filter(R.propEq('add', 'op'))
    .map(({ trackId, addedAt }) => ({ trackId, addedAt }))

  const carts = await queryUserCartDetails(userId)
  for (const { id, isPurchased } of carts) {
    if (excludePurchased && isPurchased) {
      continue
    }
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

// A cart of the user with its review fields; `review` filters the page by review state.
module.exports.getCartDetails = async (userId, cartId, stores, tracksFilter, review = undefined) => {
  await verifyCartOwnership(userId, cartId)
  return await queryCartDetails(cartId, stores, tracksFilter, { includeReview: true, review })
}

module.exports.setCartReview = async (userId, cartId, enabled) => {
  if (typeof enabled !== 'boolean') throw new BadRequest('enabled must be true or false')
  await verifyCartOwnership(userId, cartId)
  await updateCartIsInReview(cartId, enabled)
}

/**
 * Sets a cart track's review state (null for to review) and resolves to the cart's review counts within the given
 * stores, so the tabs can update without reloading the list.
 */
module.exports.setCartTrackReviewState = async (userId, cartId, trackId, state, stores) => {
  if (state !== null && !REVIEW_STATES.includes(state)) {
    throw new BadRequest(`state must be one of ${REVIEW_STATES.join(', ')} or null`)
  }
  await verifyCartOwnership(userId, cartId)
  const updated = await updateCartTrackReviewState(cartId, trackId, state)
  if (!updated) throw new NotFound(`Track ${trackId} is not in cart ${cartId}`)
  return { trackId: Number(trackId), reviewState: state, counts: await queryCartReviewCounts(cartId, stores) }
}

/**
 * Every accepted track of the cart within the given stores, newest first, with a link per store it is on (within the
 * stores): the track's page on the store, or else its release's page. `[{ trackId, links: [{ store, url }] }]`
 */
module.exports.getAcceptedTrackLinks = async (userId, cartId, stores) => {
  await verifyCartOwnership(userId, cartId)
  const tracks = await queryCartTracksInReviewState(cartId, 'accepted', stores)
  return tracks.map(({ trackId, stores: trackStores }) => ({
    trackId,
    links: (trackStores || [])
      .filter(({ name }) => !stores || stores.includes(name.toLowerCase()))
      .map(({ name, url, release }) => ({ store: name, url: url || release?.url || null }))
      .filter(({ url }) => url),
  }))
}

const verifyOwnCart = async (userId, cartId) => {
  if (!Number.isInteger(Number(cartId))) throw new BadRequest(`Invalid cart id: ${cartId}`)
  await verifyCartOwnership(userId, Number(cartId))
}

/**
 * Removes every track of the cart in one review state ('accepted' or 'rejected', within the given stores) and, for
 * `move`, adds those not already there to another cart of the user, or to a new cart named `newCartName`, where they
 * start to review. One transaction; Spotify-synced carts are updated after it. Resolves to
 * `{ count, targetCart, undo }`, where `undo` is the body for undoReviewedTracks.
 */
module.exports.modifyReviewedTracks = async (
  userId,
  cartId,
  state,
  { action, targetCartId, newCartName } = {},
  stores,
) => {
  if (!REVIEW_STATES.includes(state)) throw new BadRequest(`Unknown review state: ${state}`)
  if (action !== 'remove' && action !== 'move') throw new BadRequest('action must be remove or move')
  const isNewCart = action === 'move' && targetCartId === undefined
  if (action === 'move') {
    if (isNewCart && (typeof newCartName !== 'string' || newCartName.trim() === '')) {
      throw new BadRequest('A move needs targetCartId or newCartName')
    }
    if (!isNewCart && Number(targetCartId) === Number(cartId)) {
      throw new BadRequest('The target cart must differ from the cart')
    }
  }
  await verifyCartOwnership(userId, cartId)
  if (action === 'move' && !isNewCart) await verifyOwnCart(userId, targetCartId)

  const { tracks, targetCart, addedToTarget } = await BPromise.using(pg.getTransaction(), async (tx) => {
    const tracks = (await queryCartTracksInReviewState(cartId, state, stores, tx)).map(
      ({ trackId, addedAt }) => ({ trackId, addedAt }),
    )
    const trackIds = tracks.map(({ trackId }) => trackId)
    let targetCart = null
    let addedToTarget = []
    if (action === 'move') {
      targetCart = isNewCart
        ? await insertCart(userId, { name: newCartName.trim() }, tx)
        : (
            await tx.queryRowsAsync(
              // language=PostgreSQL
              sql`SELECT cart_id AS id, cart_uuid AS uuid, cart_name AS name FROM cart WHERE cart_id = ${targetCartId}`,
            )
          )[0]
      const alreadyInTarget = new Set(await queryCartTrackIds(targetCart.id, tx))
      addedToTarget = trackIds.filter((id) => !alreadyInTarget.has(id))
      await insertTracksToCart(
        targetCart.id,
        addedToTarget.map((trackId) => ({ trackId })),
        tx,
      )
    }
    if (trackIds.length > 0) await deleteTracksFromCart(cartId, trackIds, tx)
    return { tracks, targetCart, addedToTarget }
  })

  if (tracks.length > 0) await syncRemovedTracks(userId, cartId, tracks.map(({ trackId }) => trackId))
  if (addedToTarget.length > 0) syncAddedTracks(userId, targetCart.id, addedToTarget)

  return {
    count: tracks.length,
    targetCart,
    undo: { sourceCartId: Number(cartId), tracks, targetCartId: targetCart?.id ?? null, addedToTarget },
  }
}

/**
 * Reverts modifyReviewedTracks: puts the tracks back into the cart with their original added date and review state,
 * and removes from the target cart only the tracks the move added. Tracks back in the cart meanwhile are left alone.
 */
module.exports.undoReviewedTracks = async (userId, cartId, state, { tracks, targetCartId, addedToTarget } = {}) => {
  if (!REVIEW_STATES.includes(state)) throw new BadRequest(`Unknown review state: ${state}`)
  if (!Array.isArray(tracks) || !tracks.every(({ trackId, addedAt } = {}) => Number.isInteger(trackId) && addedAt)) {
    throw new BadRequest('tracks must be a list of { trackId, addedAt }')
  }
  const removeFromTarget = targetCartId != null && Array.isArray(addedToTarget) ? addedToTarget.map(Number) : []
  await verifyCartOwnership(userId, cartId)
  if (targetCartId != null) await verifyOwnCart(userId, targetCartId)

  const restored = await BPromise.using(pg.getTransaction(), async (tx) => {
    const restored = await restoreTracksToCart(tx, cartId, tracks, state)
    if (removeFromTarget.length > 0) await deleteTracksFromCart(targetCartId, removeFromTarget, tx)
    return restored
  })

  if (restored.length > 0) syncAddedTracks(userId, Number(cartId), restored)
  if (removeFromTarget.length > 0) await syncRemovedTracks(userId, Number(targetCartId), removeFromTarget)
}

module.exports.insertCartStoreDetails = insertCartStoreDetails
module.exports.deleteCartStoreDetails = deleteCartStoreDetails
module.exports.deleteUserCartStoreDetails = deleteUserCartStoreDetails

module.exports.importPlaylistAsCart = async (userId, url) => {
  logger.debug(`Importing playlist as cart, user: ${userId}, url: ${url}`)
  const { module: storeModule } = await getStoreModuleForPlaylistByUrl(url)
  // TODO: Only available in Spotify for now
  const { title, tracks } = await storeModule.logic.getPlaylistDetailsWithTracks(url)
  logger.debug(`Importing playlist as cart, user: ${userId}, url: ${url}, title: ${title}, tracks: ${tracks.length}`)
  const storedTracks = await addStoreTracksToUsers(storeModule.logic.storeUrl, tracks, [], null, false)
  logger.debug(
    `Importing playlist as cart, user: ${userId}, url: ${url}, title: ${title}, tracks: ${storedTracks.length}`,
  )
  const createdCart = await insertCart(userId, { name: `${storeModule.logic.storeName}: ${title}` })
  logger.debug(`Importing playlist as cart, user: ${userId}, url: ${url}, title: ${title}, cart: ${createdCart.id}`)
  await insertTracksToCart(createdCart.id, storedTracks.map((trackId) => ({ trackId })))
  return createdCart
}

module.exports.enableCartSync = async (userId, cartId, storeName) => {
  try {
    const {
      cart: { name },
      tracks,
    } = await queryCartDetails(cartId, [storeName.toLowerCase()], { all: true })
    const { id: spotifyPlaylistId, url, versionId } = await createCart(userId, `Fomo Player: ${name}`, tracks)
    await insertCartStoreDetails(cartId, storeName, spotifyPlaylistId, url, versionId)
    // The same shape as an entry of a cart's storeDetails.
    return { id: spotifyPlaylistId, url, storeName, versionId }
  } catch (e) {
    logger.error(`Enabling cart sync failed for user: ${userId}, cart: ${cartId}, error: ${e.toString()}`)
    throw e
  }
}

module.exports.removeCartSync = async (userId, cartId, storeName) => {
  await deleteCartStoreDetails(cartId, storeName)
}

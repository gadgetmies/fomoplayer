const { using, each } = require('bluebird')
const R = require('ramda')
const pg = require('../../db/pg.js')
const { searchForTracks } = require('../shared/db/search')
const { insertUserPlaylistFollow } = require('../shared/db/user')
const { updateArtistTracks, updatePlaylistTracks, updateLabelTracks } = require('../shared/tracks')
const {
  getStoreModuleForArtistByUrl,
  getStoreModuleForLabelByUrl,
  getStoreModuleForPlaylistByUrl
} = require('../shared/stores')
const { addStoreTrackToUsers } = require('./shared')
const { NotFound, Forbidden } = require('../shared/httpErrors')

const { ensureArtistExists, ensureLabelExists } = require('../shared/db/store')

const {
  addArtistOnLabelToIgnore,
  addArtistsToIgnore,
  addLabelsToIgnore,
  artistOnLabelInIgnore,
  addReleasesToIgnore,
  addArtistWatch,
  addLabelWatch,
  deletePlaylistFollowFromUser,
  queryUserArtistFollows,
  queryUserLabelFollows,
  queryUserPlaylistFollows,
  queryUserArtistOnLabelIgnores,
  queryUserLabelIgnores,
  queryUserArtistIgnores,
  queryUserTracks,
  deleteArtistWatchesFromUser,
  deleteArtistWatchFromUser,
  deleteLabelWatchesFromUser,
  deleteLabelWatchFromUser,
  deleteArtistOnLabelIgnoreFromUser,
  deleteLabelIgnoreFromUser,
  deleteArtistIgnoreFromUser,
  setAllHeard,
  setTrackHeard,
  queryUserCarts,
  insertCart,
  queryCartDetails,
  deleteCart,
  updateCart,
  queryDefaultCartId,
  insertTracksToCart,
  deleteTracksFromCart,
  queryCartOwner,
  queryNotificationOwner,
  upsertNotification,
  deleteNotification,
  queryNotifications
} = require('./db')

const logger = require('../../logger')(__filename)
const { apiURL } = require('../../config')

module.exports.getUserTracks = queryUserTracks
module.exports.getUserArtistFollows = queryUserArtistFollows
module.exports.getUserLabelFollows = queryUserLabelFollows
module.exports.getUserPlaylistFollows = queryUserPlaylistFollows

module.exports.getUserArtistOnLabelIgnores = queryUserArtistOnLabelIgnores
module.exports.getUserLabelIgnores = queryUserLabelIgnores
module.exports.getUserArtistIgnores = queryUserArtistIgnores

module.exports.removeArtistOnLabelIgnoreFromUser = deleteArtistOnLabelIgnoreFromUser
module.exports.removeLabelIgnoreFromUser = deleteLabelIgnoreFromUser
module.exports.removeArtistIgnoreFromUser = deleteArtistIgnoreFromUser

const { removeIgnoredTracksFromUsers } = require('../shared/db/user.js')

module.exports.queryUserTracks = queryUserTracks
module.exports.getTracksM3u = userId =>
  queryUserTracks(userId).then(userTracks => {
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
module.exports.artistOnLabelInIgnore = artistOnLabelInIgnore
module.exports.addArtistsOnLabelsToIgnore = (userId, { artistIds, labelIds }) =>
  using(pg.getTransaction(), async tx => {
    await each(R.xprod(artistIds, labelIds), ([artistId, labelId]) =>
      addArtistOnLabelToIgnore(tx, artistId, labelId, userId)
    )
    await removeIgnoredTracksFromUsers(tx, [userId])
  })

module.exports.addArtistsToIgnore = async (userId, artistIds) => {
  try {
    using(pg.getTransaction(), async tx => {
      await addArtistsToIgnore(tx, artistIds, userId)
      await removeIgnoredTracksFromUsers(tx, [userId])
    })
  } catch (e) {
    logger.error(e)
  }
}

module.exports.addLabelsToIgnore = async (userId, labelIds) =>
  using(pg.getTransaction(), async tx => {
    await addLabelsToIgnore(tx, labelIds, userId)
    await removeIgnoredTracksFromUsers(tx, [userId])
  })

module.exports.addReleasesToIgnore = async (userId, releaseIds) => {
  using(pg.getTransaction(), async tx => {
    await addReleasesToIgnore(tx, releaseIds, userId)
    await removeIgnoredTracksFromUsers(tx, [userId])
  })
}

module.exports.removeArtistWatchesFromUser = deleteArtistWatchesFromUser
module.exports.removeArtistWatchFromUser = deleteArtistWatchFromUser
module.exports.removeLabelWatchesFromUser = deleteLabelWatchesFromUser
module.exports.removeLabelWatchFromUser = deleteLabelWatchFromUser

const addStoreArtistToUser = (module.exports.addStoreArtistToUser = async (storeUrl, userId, artist, sourceId) => {
  return using(pg.getTransaction(), async tx => {
    const { id: artistId, storeArtistId } = await ensureArtistExists(tx, storeUrl, artist, sourceId)
    const followId = await addArtistWatch(tx, userId, artistId, sourceId)
    return { artistId, followId, storeArtistId }
  })
})

const addStoreLabelToUser = (module.exports.addStoreLabelToUser = async (storeUrl, userId, label, sourceId) => {
  return using(pg.getTransaction(), async tx => {
    const { storeLabelId, labelId } = await ensureLabelExists(tx, storeUrl, label, sourceId)
    const followId = await addLabelWatch(tx, userId, labelId, sourceId)
    return { labelId, followId, storeLabelId }
  })
})

module.exports.removePlaylistFollowFromUser = async (userId, playlistId) =>
  deletePlaylistFollowFromUser(userId, playlistId)

module.exports.addArtistFollowsWithIds = async (artistIds, userId) => {
  const addedFollows = []
  for (const artistId of artistIds) {
    await using(pg.getTransaction(), async tx => {
      const followId = addArtistWatch(tx, userId, artistId)
      addedFollows.push({
        artist: `${apiURL}/artists/${artistId}`,
        follow: `${apiURL}/users/${userId}/follows/artists/${followId}`
      })
    })
  }

  return addedFollows
}

function getFullUrl(storeUrl, url) {
  return (storeUrl !== undefined ? storeUrl : '') + url
}

module.exports.addArtistFollows = async (storeUrl, artists, userId, sourceId) => {
  // TODO: try first to find from db
  let addedFollows = []
  for (const { name, url } of artists) {
    const fullUrl = getFullUrl(storeUrl, url)
    const { module: storeModule, idFromUrl } = await getStoreModuleForArtistByUrl(fullUrl)
    let artistDetails = { url: fullUrl, id: idFromUrl, name }

    if (name === undefined) {
      artistDetails.name = await storeModule.logic.getArtistName(fullUrl)
    }

    const { artistId, followId, storeArtistId } = await addStoreArtistToUser(
      storeModule.logic.storeUrl,
      userId,
      artistDetails,
      sourceId
    )
    addedFollows.push({
      artist: `${apiURL}/artists/${artistId}`,
      follow: `${apiURL}/users/${userId}/follows/artists/${followId}`
    })

    process.nextTick(async () => {
      try {
        await updateArtistTracks(
          storeModule.logic.storeUrl,
          { storeArtistId, artistStoreId: artistDetails.id, url },
          sourceId
        )
      } catch (e) {
        logger.error('Failed to update artist tracks', e)
      }
    })
  }

  return addedFollows
}

module.exports.addLabelFollowsWithIds = async (labelIds, userId) => {
  const addedFollows = []
  for (const labelId of labelIds) {
    await using(pg.getTransaction(), async tx => {
      const followId = addLabelWatch(tx, userId, labelId)
      addedFollows.push({
        label: `${apiURL}/labels/${labelId}`,
        follow: `${apiURL}/users/${userId}/follows/labels/${followId}`
      })
    })
  }

  return addedFollows
}

module.exports.addLabelFollows = async (storeUrl, labels, userId, sourceId) => {
  // TODO: try first to find from db
  let addedFollows = []
  for (const { name, url } of labels) {
    const fullUrl = getFullUrl(storeUrl, url)
    const { module: storeModule, idFromUrl } = await getStoreModuleForLabelByUrl(fullUrl)
    let labelDetails = { url: fullUrl, id: idFromUrl, name }

    if (name === undefined) {
      labelDetails.name = await storeModule.logic.getLabelName(fullUrl)
    }

    const { labelId, followId, storeLabelId } = await addStoreLabelToUser(
      storeModule.logic.storeUrl,
      userId,
      labelDetails,
      sourceId
    )

    addedFollows.push({
      label: `${apiURL}/labels/${labelId}`,
      follow: `${apiURL}/users/${userId}/follows/labels/${followId}`
    })

    process.nextTick(async () => {
      try {
        await updateLabelTracks(
          storeModule.logic.storeUrl,
          { storeLabelId, labelStoreId: labelDetails.id, url },
          sourceId
        )
      } catch (e) {
        logger.error('Failed to update label tracks', e)
      }
    })
  }

  return addedFollows
}

module.exports.addPlaylistFollows = async (playlists, userId, sourceId) => {
  // TODO: try first to find from db
  let addedPlaylists = []
  for (const { url } of playlists) {
    const { module: storeModule, typeId } = await getStoreModuleForPlaylistByUrl(url)

    const playlistStoreId = await storeModule.logic.getPlaylistId(url)
    const name = await storeModule.logic.getPlaylistName(typeId, url)

    const { playlistId, followId } = await insertUserPlaylistFollow(
      userId,
      storeModule.logic.storeName,
      playlistStoreId,
      name,
      typeId
    )

    addedPlaylists.push({
      playlist: `${apiURL}/playlists/${playlistId}`,
      follow: `${apiURL}/users/${userId}/follows/playlists/${followId}`
    })

    process.nextTick(async () => {
      try {
        await updatePlaylistTracks(
          storeModule.logic.storeUrl,
          { playlistId, playlistStoreId, url, type: typeId },
          sourceId
        )
      } catch (e) {
        logger.error('Failed to update playlist tracks', e)
      }
    })
  }

  return addedPlaylists
}

module.exports.addStoreTracksToUser = async (storeUrl, type, tracks, userId, sourceId) => {
  logger.info('Start processing received tracks')

  let addedTracks = []
  for (const track of tracks) {
    const trackId = await addStoreTrackToUsers(storeUrl, [userId], track, sourceId, type)
    addedTracks.push(`${apiURL}/tracks/${trackId}`)
  }

  return addedTracks
}

const verifyCartOwnership = async (userId, cartId) => {
  const rows = await queryCartOwner(cartId)
  if (rows.length === 0) {
    throw new NotFound('Cart with id not found!')
  } else if (rows[0].ownerUserId !== userId) {
    throw new Forbidden('Cart owner does not match the session user!')
  }
}

const verifyNotificationOwnership = async (userId, notificationId) => {
  const rows = await queryNotificationOwner(notificationId)
  if (rows.length === 0) {
    throw new NotFound('Notification with id not found!')
  } else if (rows[0].ownerUserId !== userId) {
    throw new Forbidden('Notification owner does not match the session user!')
  }
}

module.exports.getUserCarts = queryUserCarts
module.exports.createCart = insertCart
module.exports.removeCart = async (userId, cartId) => {
  await verifyCartOwnership(userId, cartId)
  await deleteCart(cartId)
}

module.exports.updateCartDetails = async (userId, cartId, properties) => {
  await verifyCartOwnership(userId, cartId)
  await updateCart(cartId, properties)
}

const addTracksToCart = (module.exports.addTracksToCart = async (userId, cartId, trackIds) => {
  await verifyCartOwnership(userId, cartId)
  await insertTracksToCart(cartId, trackIds)
})

const removeTracksFromCart = (module.exports.removeTracksFromCart = async (userId, cartId, trackIds) => {
  await verifyCartOwnership(userId, cartId)
  await deleteTracksFromCart(cartId, trackIds)
})

module.exports.updateCartContents = async (userId, cartId, operations) => {
  const tracksToBeRemoved = operations.filter(R.propEq('op', 'remove')).map(R.prop('trackId'))
  const tracksToBeAdded = operations.filter(R.propEq('op', 'add')).map(R.prop('trackId'))

  await removeTracksFromCart(userId, cartId, tracksToBeRemoved)
  await addTracksToCart(userId, cartId, tracksToBeAdded)
}

const getCartDetails = (module.exports.getCartDetails = async (userId, cartId) => {
  await verifyCartOwnership(userId, cartId)
  return await queryCartDetails(cartId)
})

module.exports.getDefaultCartDetails = async userId => {
  const id = await queryDefaultCartId(userId)
  return getCartDetails(userId, id)
}

module.exports.getNotifications = async userId => {
  return await queryNotifications(userId)
}

module.exports.createNotification = async (userId, searchString) => {
  const trackIds = await searchForTracks(searchString, userId).map(R.prop('track_id'))
  using(pg.getTransaction(), async tx => {
    await upsertNotification(tx, userId, searchString, trackIds)
  })
}

module.exports.removeNotification = async (userId, notificationId) => {
  await verifyNotificationOwnership(userId, notificationId)
  await deleteNotification(notificationId)
}

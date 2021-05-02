const { using, each } = require('bluebird')
const R = require('ramda')
const pg = require('../../db/pg.js')
const { insertUserPlaylistFollow } = require('../shared/db/user')
const { updateArtistTracks, updatePlaylistTracks, updateLabelTracks } = require('../shared/tracks')
const {
  getStoreModuleForArtistByUrl,
  getStoreModuleForLabelByUrl,
  getStoreModuleForPlaylistByUrl
} = require('../shared/stores')
const { addStoreTrackToUsers } = require('./shared')
const { NotFound, Forbidden, BadRequest } = require('../shared/httpErrors')

const { ensureArtistExists, ensureLabelExists, queryStoreRegexes } = require('../shared/db/store')

const {
  addArtistOnLabelToIgnore,
  addArtistWatch,
  addLabelWatch,
  deletePlaylistFollowFromUser,
  queryUserArtistFollows,
  queryUserLabelFollows,
  queryUserPlaylistFollows,
  queryUserTracks,
  deleteArtistWatchesFromUser,
  deleteArtistWatchFromUser,
  deleteLabelWatchesFromUser,
  deleteLabelWatchFromUser,
  setAllHeard,
  setTrackHeard,
  queryUserCarts,
  insertCart,
  queryCartDetails,
  deleteCart,
  queryDefaultCartId,
  insertTracksToCart,
  deleteTracksFromCart,
  queryCartOwner
} = require('./db')

const { modules: storeModules } = require('../stores/index.js')
const { apiURL } = require('../../config')

module.exports.getUserTracks = queryUserTracks
module.exports.getUserArtistFollows = queryUserArtistFollows
module.exports.getUserLabelFollows = queryUserLabelFollows
module.exports.getUserPlaylistFollows = queryUserPlaylistFollows

const { removeIgnoredTracksFromUser } = require('../shared/db/user.js')

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
  using(pg.getTransaction(), tx =>
    each(R.xprod(artistIds, labelIds), ([artistId, labelId]) =>
      addArtistOnLabelToIgnore(tx, artistId, labelId, username).tap(() => removeIgnoredTracksFromUser(tx, username))
    )
  )

module.exports.removeArtistWatchesFromUser = deleteArtistWatchesFromUser
module.exports.removeArtistWatchFromUser = deleteArtistWatchFromUser
module.exports.removeLabelWatchesFromUser = deleteLabelWatchesFromUser
module.exports.removeLabelWatchFromUser = deleteLabelWatchFromUser

const addStoreArtistToUser = (module.exports.addStoreArtistToUser = async (storeUrl, userId, artist, source) => {
  return using(pg.getTransaction(), async tx => {
    const { id: artistId, storeArtistId } = await ensureArtistExists(tx, storeUrl, artist, source)
    const followId = await addArtistWatch(tx, userId, artistId, source)
    return { artistId, followId, storeArtistId }
  })
})

const addStoreLabelToUser = (module.exports.addStoreLabelToUser = async (storeUrl, userId, label, source) => {
  return using(pg.getTransaction(), async tx => {
    const { storeLabelId, labelId } = await ensureLabelExists(tx, storeUrl, label, source)
    const followId = await addLabelWatch(tx, userId, labelId, source)
    return { labelId, followId, storeLabelId }
  })
})

module.exports.removePlaylistFollowFromUser = async (userId, playlistId) =>
  deletePlaylistFollowFromUser(userId, playlistId)

module.exports.addArtistFollows = async (storeUrl, artists, userId, source) => {
  // TODO: try first to find from db
  let addedArtists = []
  for (const { name, url } of artists) {
    const { module: storeModule, idFromUrl } = await getStoreModuleForArtistByUrl(url)
    let artistDetails = { url: (storeUrl !== undefined ? storeUrl : '') + url, id: idFromUrl }

    if (name === undefined) {
      artistDetails.name = await storeModule.logic.getArtistName(url)
    }

    const { artistId, followId, storeArtistId } = await addStoreArtistToUser(
      storeModule.logic.storeUrl,
      userId,
      artistDetails,
      source
    )
    addedArtists.push({
      artist: `${apiURL}/artists/${artistId}`,
      follow: `${apiURL}/users/${userId}/follows/artists/${followId}`
    })

    process.nextTick(async () => {
      try {
        await updateArtistTracks(
          storeModule.logic.storeUrl,
          { storeArtistId, artistStoreId: artistDetails.id, url },
          source
        )
      } catch (e) {
        console.error('Failed to update artist tracks', e)
      }
    })
  }

  return addedArtists
}

module.exports.addLabelFollows = async (storeUrl, labels, userId, source) => {
  // TODO: try first to find from db
  let addedLabels = []
  for (const { name, url } of labels) {
    const { module: storeModule, idFromUrl } = await getStoreModuleForLabelByUrl(url)
    let labelDetails = { url: (storeUrl !== undefined ? storeUrl : '') + url, id: idFromUrl }

    if (name === undefined) {
      labelDetails.name = await storeModule.logic.getLabelName(url)
    }

    const { labelId, followId, storeLabelId } = await addStoreLabelToUser(
      storeModule.logic.storeUrl,
      userId,
      labelDetails,
      source
    )

    addedLabels.push({
      label: `${apiURL}/labels/${labelId}`,
      follow: `${apiURL}/users/${userId}/follows/labels/${followId}`
    })

    process.nextTick(async () => {
      try {
        await updateLabelTracks(
          storeModule.logic.storeUrl,
          { storeLabelId, labelStoreId: labelDetails.id, url },
          source
        )
      } catch (e) {
        console.error('Failed to update label tracks', e)
      }
    })
  }

  return addedLabels
}

module.exports.addPlaylistFollows = async (playlists, userId, source) => {
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
          source
        )
      } catch (e) {
        console.error('Failed to update playlist tracks', e)
      }
    })
  }

  return addedPlaylists
}

module.exports.addStoreTracksToUser = async (storeUrl, type, tracks, userId, source) => {
  console.log('Start processing received tracks')

  let addedTracks = []
  for (const track of tracks) {
    const trackId = await addStoreTrackToUsers(storeUrl, [userId], track, type, source)
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

module.exports.getUserCarts = queryUserCarts
module.exports.createCart = insertCart
module.exports.removeCart = async (userId, cartId) => {
  await verifyCartOwnership(userId, cartId)
  await deleteCart(cartId)
}

const addTracksToCart = (module.exports.addTracksToCart = async (userId, cartId, trackIds) => {
  await verifyCartOwnership(userId, cartId)
  await insertTracksToCart(cartId, trackIds)
})

const addTracksToDefaultCart = (module.exports.addTracksToDefaultCart = async (userId, trackIds) => {
  const id = await queryDefaultCartId(userId)
  await addTracksToCart(userId, id, trackIds)
})

const removeTracksFromCart = (module.exports.removeTracksFromCart = async (userId, cartId, trackIds) => {
  await verifyCartOwnership(userId, cartId)
  await deleteTracksFromCart(cartId, trackIds)
})

const removeTracksFromDefaultCart = (module.exports.removeTracksFromDefaultCart = async (userId, trackIds) => {
  const id = await queryDefaultCartId(userId)
  await removeTracksFromCart(userId, id, trackIds)
})

module.exports.updateDefaultCart = async (userId, operations) => {
  const tracksToBeRemoved = operations.filter(R.propEq('op', 'remove')).map(R.prop('trackId'))
  const tracksToBeAdded = operations.filter(R.propEq('op', 'add')).map(R.prop('trackId'))

  await removeTracksFromDefaultCart(userId, tracksToBeRemoved)
  await addTracksToDefaultCart(userId, tracksToBeAdded)
}

const getCartDetails = (module.exports.getCartDetails = async (userId, cartId) => {
  await verifyCartOwnership(userId, cartId)
  const [details] = await queryCartDetails(cartId)
  return details
})

module.exports.getDefaultCartDetails = async userId => {
  const id = await queryDefaultCartId(userId)
  return getCartDetails(userId, id)
}

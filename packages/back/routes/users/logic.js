const { using, map } = require('bluebird')
const R = require('ramda')
const pg = require('../../db/pg.js')
const { scheduleEmail } = require('../../services/mailer')
const { insertUserPlaylistFollow } = require('../shared/db/user')
const { updateArtistTracks, updatePlaylistTracks, updateLabelTracks } = require('../shared/tracks')
const {
  getStoreModuleForArtistByUrl,
  getStoreModuleForLabelByUrl,
  getStoreModuleForPlaylistByUrl
} = require('../shared/stores')
const { NotFound, Forbidden } = require('../shared/httpErrors')

const { ensureArtistExists, ensureLabelExists } = require('../shared/db/store')

const {
  addArtistOnLabelToIgnore,
  addArtistsToIgnore,
  addLabelsToIgnore,
  artistOnLabelInIgnore,
  addReleasesToIgnore,
  addStoreArtistWatch,
  addStoreLabelWatch,
  deletePlaylistFollowFromUser,
  queryFollowOwner,
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
  deleteArtistsOnLabelsIgnores,
  deleteLabelIgnoreFromUser,
  deleteArtistIgnoreFromUser,
  setAllHeard,
  setTrackHeard,
  setFollowStarred,
  queryUserScoreWeights,
  updateUserScoreWeights,
  queryNotificationOwner,
  updateNotifications,
  queryNotifications,
  addPurchasedTracksToUser,
  queryUserSettings,
  upsertEmail,
  getEmailVerificationCode,
  queryStoreArtistIds,
  queryStoreLabelIds,
  queryAuthorizations,
  deleteAuthorization
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
const { deleteUserCartStoreDetails } = require('../shared/cart')

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
    const ids = (
      await map(R.xprod(artistIds, labelIds), ([artistId, labelId]) =>
        addArtistOnLabelToIgnore(tx, artistId, labelId, userId)
      )
    ).map(([{ user__artist__label_ignore }]) => user__artist__label_ignore)
    await removeIgnoredTracksFromUsers(tx, [userId])
    return ids
  })

module.exports.removeArtistsOnLabelsIgnores = async artistOnLabelIgnoreIds => {
  await deleteArtistsOnLabelsIgnores(artistOnLabelIgnoreIds)
}

module.exports.addArtistsToIgnore = async (userId, artistIds) => {
  try {
    using(pg.getTransaction(), async tx => {
      await addArtistsToIgnore(tx, artistIds, userId)
      await removeIgnoredTracksFromUsers(tx, [userId])
    })
  } catch (e) {
    logger.error('Adding artists to ignore failed', e)
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
    const followId = await addStoreArtistWatch(tx, userId, storeArtistId, sourceId)
    return { artistId, followId, storeArtistId }
  })
})

const addStoreLabelToUser = (module.exports.addStoreLabelToUser = async (storeUrl, userId, label, sourceId) => {
  return using(pg.getTransaction(), async tx => {
    const { storeLabelId, labelId } = await ensureLabelExists(tx, storeUrl, label, sourceId)
    const followId = await addStoreLabelWatch(tx, userId, storeLabelId, sourceId)
    return { labelId, followId, storeLabelId }
  })
})

module.exports.removePlaylistFollowFromUser = async (userId, playlistId) =>
  deletePlaylistFollowFromUser(userId, playlistId)

module.exports.addArtistFollowsWithIds = async (artistIds, userId) => {
  const addedFollows = []
  for (const artistId of artistIds) {
    await using(pg.getTransaction(), async tx => {
      const storeArtistIds = await queryStoreArtistIds(tx, artistId)
      for (const storeArtistId of storeArtistIds) {
        const followId = addStoreArtistWatch(tx, userId, storeArtistId)
        addedFollows.push({
          artist: `${apiURL}/artists/${artistId}`,
          follow: `${apiURL}/users/${userId}/follows/artists/${followId}`
        })
      }
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
    const { module: storeModule, id } = await getStoreModuleForArtistByUrl(fullUrl)
    let artistDetails = { url: fullUrl, id, name }

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
      const storeLabelIds = await queryStoreLabelIds(tx, labelId)
      for (const storeLabelId of storeLabelIds) {
        const followId = addStoreLabelWatch(tx, userId, storeLabelId)
        addedFollows.push({
          label: `${apiURL}/labels/${labelId}`,
          follow: `${apiURL}/users/${userId}/follows/labels/${followId}`
        })
      }
    })
  }

  return addedFollows
}

module.exports.addLabelFollows = async (storeUrl, labels, userId, sourceId) => {
  // TODO: try first to find from db
  let addedFollows = []
  for (const { name, url } of labels) {
    const fullUrl = getFullUrl(storeUrl, url)
    const { module: storeModule, id } = await getStoreModuleForLabelByUrl(fullUrl)
    let labelDetails = { url: fullUrl, id, name }

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

module.exports.setFollowStarred = async (userId, type, followId, starred) => {
  await verifyFollowOwnership(userId, type, followId)
  await setFollowStarred(type, followId, starred)
}

module.exports.addPurchasedTracksToUser = async (userId, trackIds) => {
  await addPurchasedTracksToUser(userId, trackIds)
}

const verifyFollowOwnership = async (userId, type, followId) => {
  const rows = await queryFollowOwner(type, followId)
  if (rows.length === 0) {
    throw new NotFound('Follow with id not found!')
  } else if (rows[0].ownerUserId !== userId) {
    throw new Forbidden('Follow owner does not match the session user!')
  }
}

module.exports.getUserScoreWeights = queryUserScoreWeights
module.exports.setUserScoreWeights = updateUserScoreWeights

module.exports.getNotifications = async userId => {
  return queryNotifications(userId)
}

module.exports.updateNotifications = async (userId, operations) => {
  await using(pg.getTransaction(), async tx => {
    await updateNotifications(tx, userId, operations)
  })

  return queryNotifications(userId)
}

module.exports.getUserSettings = async userId => {
  return await queryUserSettings(userId)
}

module.exports.setEmail = async (userId, email) => {
  await upsertEmail(userId, email)
  const verificationCode = await getEmailVerificationCode(userId)
  const verificationURL = `${apiURL}/verify-email/${verificationCode}`
  await scheduleEmail(
    process.env.VERIFICATION_EMAIL_SENDER,
    email,
    'Email address verification',
    `Please verify that you would like to use this email address for receiving 
messages from the Fomo Player by opening the following address in your browser:
${verificationURL}`,
    `<p>Please verify that you would like to use this email address for receiving 
messages from the Fomo Player by clicking 
<a href="${verificationURL}">here</a> or opening the
following address in your browser: ${verificationURL}.
</p>`
  )
}

module.exports.getAuthorizations = queryAuthorizations
module.exports.removeAuthorization = async (userId, storeName) => {
  await deleteUserCartStoreDetails(userId, storeName)
  await deleteAuthorization(userId, storeName)
}

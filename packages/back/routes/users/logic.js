const BPromise = require('bluebird')
const R = require('ramda')
const sql = require('sql-template-strings')
const pg = require('fomoplayer_shared').db.pg
const { scheduleEmail } = require('../../services/mailer')
const { insertUserPlaylistFollow } = require('../shared/db/user')
const {
  updateArtistTracks,
  updatePlaylistTracks,
  updateLabelTracks,
  addStoreTracksToUsers,
} = require('../shared/tracks')
const { getStoreModuleForArtistByUrl, getStoreModuleForLabelByUrl } = require('../shared/stores')
const { NotFound, Forbidden } = require('../shared/httpErrors')
const { modules: storeModules } = require('../stores/store-modules')
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
  queryHeardStatusForStoreIds,
  setFollowStarred,
  queryUserScoreWeights,
  updateUserScoreWeights,
  updateNotifications,
  queryNotifications,
  addPurchasedTracksToUsers,
  queryUserSettings,
  upsertEmail,
  getEmailVerificationCode,
  queryStoreArtistIds,
  queryStoreLabelIds,
  queryAuthorizations,
  deleteAuthorization,
} = require('./db')

const { parseNotificationText, buildNotificationPredicate } = require('../shared/db/notification-predicate')

const logger = require('fomoplayer_shared').logger(__filename)
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

const { updateIgnoresInUserTracks } = require('../shared/db/user.js')
const { deleteUserCartStoreDetails } = require('../shared/cart')
const { insertSource } = require('../../jobs/watches/shared/db')
const { getStoreDetailsFromUrl } = require('../stores/logic')

module.exports.getTracksM3u = (userId) =>
  queryUserTracks(userId).then((userTracks) => {
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
module.exports.getHeardStatusForStoreIds = queryHeardStatusForStoreIds

module.exports.addArtistOnLabelToIgnore = addArtistOnLabelToIgnore
module.exports.artistOnLabelInIgnore = artistOnLabelInIgnore
module.exports.addArtistsOnLabelsToIgnore = (userId, { artistIds, labelIds }) =>
  BPromise.using(pg.getTransaction(), async (tx) => {
    const ids = (
      await BPromise.map(R.xprod(artistIds, labelIds), ([artistId, labelId]) =>
        addArtistOnLabelToIgnore(tx, artistId, labelId, userId),
      )
    ).map(([{ user__artist__label_ignore }]) => user__artist__label_ignore)
    await updateIgnoresInUserTracks(tx, [userId])
    return ids
  })

module.exports.removeArtistsOnLabelsIgnores = async (artistOnLabelIgnoreIds) => {
  await deleteArtistsOnLabelsIgnores(artistOnLabelIgnoreIds)
}

module.exports.addArtistsToIgnore = async (userId, artistIds) => {
  try {
    BPromise.using(pg.getTransaction(), async (tx) => {
      await addArtistsToIgnore(tx, artistIds, userId)
      await updateIgnoresInUserTracks(tx, [userId])
    })
  } catch (e) {
    logger.error('Adding artists to ignore failed', e)
  }
}

module.exports.addLabelsToIgnore = async (userId, labelIds) =>
  BPromise.using(pg.getTransaction(), async (tx) => {
    await addLabelsToIgnore(tx, labelIds, userId)
    await updateIgnoresInUserTracks(tx, [userId])
  })

module.exports.addReleasesToIgnore = async (userId, releaseIds) => {
  BPromise.using(pg.getTransaction(), async (tx) => {
    await addReleasesToIgnore(tx, releaseIds, userId)
    await updateIgnoresInUserTracks(tx, [userId])
  })
}

module.exports.removeArtistWatchesFromUser = deleteArtistWatchesFromUser
module.exports.removeArtistWatchFromUser = deleteArtistWatchFromUser
module.exports.removeLabelWatchesFromUser = deleteLabelWatchesFromUser
module.exports.removeLabelWatchFromUser = deleteLabelWatchFromUser

const addStoreArtistToUser = (module.exports.addStoreArtistToUser = async (storeUrl, userId, artist, sourceId) => {
  return BPromise.using(pg.getTransaction(), async (tx) => {
    const { id: artistId, storeArtistId } = await ensureArtistExists(tx, storeUrl, artist, sourceId)
    logger.debug(`Ensured artist exists: id: ${artistId}, storeid: ${storeArtistId}, store url: ${storeUrl}`)
    const followId = await addStoreArtistWatch(tx, userId, storeArtistId)
    return { artistId, followId, storeArtistId }
  })
})

const addStoreLabelToUser = (module.exports.addStoreLabelToUser = async (storeUrl, userId, label, sourceId) => {
  return BPromise.using(pg.getTransaction(), async (tx) => {
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
    await BPromise.using(pg.getTransaction(), async (tx) => {
      const storeArtistIds = await queryStoreArtistIds(tx, artistId)
      for (const storeArtistId of storeArtistIds) {
        const followId = addStoreArtistWatch(tx, userId, storeArtistId)
        addedFollows.push({
          artist: `${apiURL}/artists/${artistId}`,
          follow: `${apiURL}/users/${userId}/follows/artists/${followId}`,
        })
      }
    })
  }

  return addedFollows
}

function getFullUrl(storeUrl, url) {
  return (storeUrl !== undefined ? storeUrl : '') + url
}

module.exports.addArtistFollows = async (storeUrl = undefined, artists, userId, sourceId) => {
  logger.info('addArtistFollows', { artists, userId })
  // TODO: try first to find from db
  let addedFollows = []
  for (const { name, url } of artists) {
    const fullUrl = getFullUrl(storeUrl, url)
    const storeModule = await getStoreModuleForArtistByUrl(fullUrl)
    logger.info('artist', { name, url, fullUrl, storeName: storeModule.storeName })
    const artistDetails = await storeModule.logic.getArtistDetails(fullUrl)
    logger.info('artistDetails', artistDetails)
    const { artistId, followId, storeArtistId } = await addStoreArtistToUser(
      storeModule.logic.storeUrl,
      userId,
      artistDetails,
      sourceId,
    )
    addedFollows.push({
      name,
      artist: `${apiURL}/artists/${artistId}`,
      follow: `${apiURL}/users/${userId}/follows/artists/${followId}`,
      url: fullUrl,
    })

    process.nextTick(async () => {
      try {
        await updateArtistTracks(
          storeModule.logic.storeUrl,
          { storeArtistId, artistStoreId: artistDetails.id, url },
          sourceId,
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
    await BPromise.using(pg.getTransaction(), async (tx) => {
      const storeLabelIds = await queryStoreLabelIds(tx, labelId)
      for (const storeLabelId of storeLabelIds) {
        const followId = addStoreLabelWatch(tx, userId, storeLabelId)
        addedFollows.push({
          label: `${apiURL}/labels/${labelId}`,
          follow: `${apiURL}/users/${userId}/follows/labels/${followId}`,
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
    const storeModule = await getStoreModuleForLabelByUrl(fullUrl)
    const { id } = await getStoreDetailsFromUrl(fullUrl, [storeModule.logic.storeName])
    let labelDetails = { url: fullUrl, id, name }

    if (name === undefined) {
      labelDetails.name = await storeModule.logic.getLabelName(id)
    }

    const { labelId, followId, storeLabelId } = await addStoreLabelToUser(
      storeModule.logic.storeUrl,
      userId,
      labelDetails,
      sourceId,
    )

    addedFollows.push({
      label: `${apiURL}/labels/${labelId}`,
      follow: `${apiURL}/users/${userId}/follows/labels/${followId}`,
    })

    process.nextTick(async () => {
      try {
        await updateLabelTracks(
          storeModule.logic.storeUrl,
          { storeLabelId, labelStoreId: labelDetails.id, url },
          sourceId,
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
    const { storeName, type, id } = await getStoreDetailsFromUrl(url)
    const storeModule = storeModules[storeName]
    const [{ id: playlistStoreId, name }] = await storeModule.logic.getFollowDetails({ id, url, type })
    const { playlistId, followId } = await insertUserPlaylistFollow(userId, storeName, playlistStoreId, name, type)

    addedPlaylists.push({
      playlist: `${apiURL}/playlists/${playlistId}`,
      follow: `${apiURL}/users/${userId}/follows/playlists/${followId}`,
    })

    process.nextTick(async () => {
      try {
        await updatePlaylistTracks(storeModule.logic.storeUrl, { playlistId, id, url, type, playlistStoreId }, sourceId)
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
  await addPurchasedTracksToUsers([userId], trackIds.map((trackId) => ({ trackId })))
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

module.exports.getNotificationTracks = async (userId, stores, limit, offset) => {
  const storeFilter = stores ? stores.map((s) => s.toLowerCase()) : null

  const notificationRows = await pg.queryRowsAsync(sql`
SELECT user_search_notification_id AS id,
       user_search_notification_string AS text,
       store_id AS "storeId"
FROM user_search_notification
NATURAL JOIN user_search_notification__store
NATURAL JOIN store
WHERE meta_account_user_id = ${userId}
  AND (${storeFilter}::TEXT[] IS NULL OR LOWER(store_name) = ANY(${storeFilter}))`)

  if (notificationRows.length === 0) {
    return { tracks: [], pagination: { offset, count: 0, total: 0 } }
  }

  const byId = new Map()
  for (const { id, text, storeId } of notificationRows) {
    if (!byId.has(id)) {
      byId.set(id, { text, storeIds: [] })
    }
    byId.get(id).storeIds.push(storeId)
  }

  const predicates = []
  for (const { text, storeIds } of byId.values()) {
    const parsed = parseNotificationText(text)
    predicates.push(buildNotificationPredicate(parsed, storeIds))
  }

  const whereClause = sql`(`
  predicates.forEach((p, i) => {
    if (i > 0) whereClause.append(sql` OR `)
    whereClause.append(p)
  })
  whereClause.append(sql`)`)

  const result = await BPromise.using(pg.getTransaction(), async (tx) => {
    const buildMatchingIdsCte = () => {
      const q = sql`
  matching_ids AS (
    SELECT DISTINCT track_details.track_id, track_added
    FROM track_details
      JOIN track ON track.track_id = track_details.track_id
      LEFT JOIN (
        SELECT track__artist.track_id, STRING_AGG(artist_name, ' ') AS artist_text
        FROM track__artist NATURAL JOIN artist
        GROUP BY track__artist.track_id
      ) AS artist_agg ON artist_agg.track_id = track_details.track_id
      LEFT JOIN (
        SELECT release__track.track_id, STRING_AGG(release_name, ' ') AS release_text
        FROM release__track NATURAL JOIN release
        GROUP BY release__track.track_id
      ) AS release_agg ON release_agg.track_id = track_details.track_id
      LEFT JOIN (
        SELECT track__label.track_id, STRING_AGG(COALESCE(label_name, ''), ' ') AS label_text
        FROM track__label NATURAL JOIN label
        GROUP BY track__label.track_id
      ) AS label_agg ON label_agg.track_id = track_details.track_id
      JOIN user__track ON user__track.track_id = track_details.track_id
        AND user__track.meta_account_user_id = ${userId}::INT
    WHERE user__track_heard IS NULL
      AND `
      q.append(whereClause)
      q.append(sql`)`)
      return q
    }

    const trackQuery = sql`WITH `
    trackQuery.append(buildMatchingIdsCte())
    trackQuery.append(sql`
SELECT track_details.track_id AS id
     , td.*
     , user__track_heard AS heard
     , COALESCE(user_track_carts.carts, '[]'::JSON) AS carts
FROM matching_ids
  JOIN track_details USING (track_id)
  JOIN JSON_TO_RECORD(track_details) AS td ( track_id INT, title TEXT, duration INT, added DATE, artists JSON
                                           , version TEXT, labels JSON, remixers JSON, releases JSON, keys JSON
                                           , genres JSON, previews JSON, stores JSON, released DATE, published DATE
                                           , source_details JSON)
       USING (track_id)
  JOIN user__track ON user__track.track_id = track_details.track_id
    AND user__track.meta_account_user_id = ${userId}::INT
  LEFT JOIN (
    SELECT track_id, JSON_AGG(JSON_BUILD_OBJECT('uuid', cart_uuid)) AS carts
    FROM track__cart NATURAL JOIN cart
    WHERE cart.meta_account_user_id = ${userId} AND cart_deleted IS NULL
    GROUP BY track_id
  ) user_track_carts USING (track_id)
ORDER BY track_added DESC
LIMIT ${limit} OFFSET ${offset}`)

    const countQuery = sql`WITH `
    countQuery.append(buildMatchingIdsCte())
    countQuery.append(sql`
SELECT COUNT(*) AS total FROM matching_ids`)

    const [tracks, [{ total }]] = await Promise.all([
      tx.queryRowsAsync(trackQuery),
      tx.queryRowsAsync(countQuery),
    ])

    return { tracks, total: parseInt(total, 10) }
  })

  return {
    tracks: result.tracks,
    pagination: { offset, count: result.tracks.length, total: result.total },
  }
}

module.exports.getNotifications = async (userId, stores) => {
  return queryNotifications(userId, stores)
}

module.exports.updateNotifications = async (userId, operations) => {
  await BPromise.using(pg.getTransaction(), async (tx) => {
    await updateNotifications(tx, userId, operations)
  })

  return queryNotifications(userId)
}

module.exports.getUserSettings = async (userId) => {
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
</p>`,
  )
}

module.exports.getAuthorizations = queryAuthorizations
module.exports.removeAuthorization = async (userId, storeName) => {
  await deleteUserCartStoreDetails(userId, storeName)
  await deleteAuthorization(userId, storeName)
}

module.exports.addStoreTracksToUsers = async (storeUrl, tracks, userIds, sourceId, skipOld, type = 'tracks') => {
  let storedTracks = []
  if (!storeUrl) {
    await addPurchasedTracksToUsers(
      userIds,
      tracks.map((t) => ({ trackId: t.trackId, purchased: t.purchased })),
    )
  } else {
    const sourceId = await insertSource({
      operation: 'tracksHandler',
      type,
      storeUrl,
    })

    storedTracks = await addStoreTracksToUsers(storeUrl, tracks, userIds, sourceId, skipOld, type)
  }
  return storedTracks.map((trackId) => `${apiURL}/tracks/${trackId}`)
}

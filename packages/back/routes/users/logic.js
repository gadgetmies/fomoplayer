const { using, each } = require('bluebird')
const R = require('ramda')
const pg = require('../../db/pg.js')
const { BadRequest } = require('../shared/httpErrors')

const {
  addStoreTrack,
  ensureArtistExists,
  ensureReleaseExists,
  ensureLabelExists,
  queryStoreRegexes
} = require('../shared/db/store')

const {
  addArtistOnLabelToIgnore,
  addArtistWatch,
  addLabelWatch,
  addPurchasedTrackToUser,
  addTrackToUser,
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
  setTrackHeard
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

const addStoreTrackToUsers = (module.exports.addStoreTracksToUser = async (storeUrl, userIds, track, type) => {
  return using(pg.getTransaction(), async tx => {
    let labelId
    let releaseId

    if (track.label) {
      labelId = await ensureLabelExists(tx, storeUrl, track.label)
    }
    if (track.release) {
      releaseId = await ensureReleaseExists(tx, storeUrl, track.release)
    }

    let artists = []
    for (const artist of track.artists) {
      const res = await ensureArtistExists(tx, storeUrl, artist)
      artists.push(res)
    }

    const trackId = await addStoreTrack(tx, storeUrl, labelId, releaseId, artists, track)

    for (const userId of userIds) {
      await addTrackToUser(tx, userId, trackId)

      if (type === 'purchased') {
        await addPurchasedTrackToUser(tx, userId, track)
      }
    }
    // TODO: Update materialized views

    return trackId
  })
})

module.exports.removeArtistWatchesFromUser = deleteArtistWatchesFromUser
module.exports.removeArtistWatchFromUser = deleteArtistWatchFromUser
module.exports.removeLabelWatchesFromUser = deleteLabelWatchesFromUser
module.exports.removeLabelWatchFromUser = deleteLabelWatchFromUser

const addStoreArtistToUser = (module.exports.addStoreArtistToUser = async (storeUrl, userId, artist) => {
  return using(pg.getTransaction(), async tx => {
    const { id: artistId } = await ensureArtistExists(tx, storeUrl, artist)
    const followId = await addArtistWatch(tx, userId, artistId)
    return { artistId, followId }
  })
})

const addStoreLabelToUser = (module.exports.addStoreLabelToUser = async (storeUrl, userId, label) => {
  return using(pg.getTransaction(), async tx => {
    const labelId = await ensureLabelExists(tx, storeUrl, label)
    const followId = await addLabelWatch(tx, userId, labelId)
    return { labelId, followId }
  })
})

module.exports.removePlaylistFollowFromUser = async (userId, playlistId) =>
  deletePlaylistFollowFromUser(userId, playlistId)

module.exports.addArtistFollows = async (storeUrl, artists, userId) => {
  // TODO: try first to find from db
  const storesRegexes = await queryStoreRegexes()

  let addedArtists = []
  for (const { name, url } of artists) {
    let artistDetails = { url: (storeUrl !== undefined ? storeUrl : '') + url }
    const matchingStore = storesRegexes.find(({ url, regex: { artist: artistRegex } }) => {
      const urlMatch = artistDetails.url.match(artistRegex)
      if (urlMatch !== null) {
        artistDetails.id = urlMatch[1]
      }
      return storeUrl === url || artistDetails.id !== undefined
    })

    if (matchingStore === null) {
      throw new BadRequest(`Invalid artist URL ${url}`)
    }

    if (name === undefined) {
      console.log(`Fetching artist name from ${url}`)
      artistDetails.name = await storeModules[matchingStore.name].logic.getArtistName(url)
    }

    const { artistId, followId } = await addStoreArtistToUser(matchingStore.url, userId, artistDetails)
    addedArtists.push({
      artist: `${apiURL}/artists/${artistId}`,
      follow: `${apiURL}/users/${userId}/follows/artists/${followId}`
    })
  }

  return addedArtists
}

module.exports.addLabelFollows = async (storeUrl, labels, userId) => {
  // TODO: try first to find from db
  const storeRegexes = await queryStoreRegexes()

  let addedLabels = []
  for (const label of labels) {
    let labelDetails = { url: (storeUrl !== undefined ? storeUrl : '') + label.url }
    const matchingStore = storeRegexes.find(({ url, regex: { label: labelRegex } }) => {
      const urlMatch = labelDetails.url.match(labelRegex)
      if (urlMatch !== null) {
        labelDetails.id = urlMatch[1]
      }
      return storeUrl === url || labelDetails.id !== undefined
    })

    if (matchingStore === null) {
      throw new BadRequest(`Invalid label URL ${label.url}`)
    }

    if (label.name === undefined) {
      console.log(`Fetching label name from ${label.url}`)
      labelDetails.name = await storeModules[matchingStore.name].logic.getLabelName(label.url)
    }

    const { labelId, followId } = await addStoreLabelToUser(matchingStore.url, userId, labelDetails)
    addedLabels.push({
      label: `${apiURL}/labels/${labelId}`,
      follow: `${apiURL}/users/${userId}/follows/labels/${followId}`
    })
  }

  return addedLabels
}

module.exports.addPlaylistFollows = async (playlists, userId) => {
  // TODO: try first to find from db
  const storeRegexes = await queryStoreRegexes()

  let addedPlaylists = []
  for (const { url: playlistUrl } of body) {
    let matchingStore
    let matchingRegex
    for (const store of storeRegexes) {
      matchingRegex = store.regex.playlist.find(({ regex }) => {
        return playlistUrl.match(regex) !== null
      })

      if (matchingRegex !== undefined) {
        matchingStore = store
        break
      }
    }

    if (matchingStore === undefined) {
      throw new BadRequest('Invalid playlist URL')
    }

    const { name: storeName } = matchingStore
    const storeModule = storeModules[storeName]
    const { playlistId, followId } = await storeModule.logic.addPlaylistFollow(
      userId,
      playlistUrl,
      matchingRegex.typeId
    )
    addedPlaylists.push({
      playlist: `${apiURL}/playlists/${playlistId}`,
      follow: `${apiURL}/users/${userId}/follows/playlists/${followId}`
    })
  }

  return addedPlaylists
}

module.exports.addStoreTracksToUser = async (storeUrl, type, tracks, userId) => {
  console.log('Start processing received tracks')

  let addedTracks = []
  for (const track of tracks) {
    const trackId = await addStoreTrackToUsers(storeUrl, userId, track, type)
    addedTracks.push(`${apiURL}/tracks/${trackId}`)
  }

  return addedTracks
}

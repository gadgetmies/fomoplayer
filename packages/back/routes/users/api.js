const {
  addArtistsOnLabelsToIgnore,
  addStoreArtistToUser,
  addStoreLabelToUser,
  addStoreTrackToUsers,
  getTracksM3u,
  getUserArtistFollows,
  getUserLabelFollows,
  getUserPlaylistFollows,
  getUserTracks,
  removeArtistWatchesFromUser,
  removeArtistWatchFromUser,
  removeLabelWatchesFromUser,
  removeLabelWatchFromUser,
  removePlaylistFollowFromUser,
  setAllHeard,
  setTrackHeard
} = require('./logic')

const { queryStores } = require('../shared/db/store.js')

const router = require('express').Router()
const { apiURL } = require('../../config')
const { BadRequest } = require('../shared/httpErrors')

const {} = require('./logic')

const { modules: storeModules } = require('../stores/index.js')

router.get('/tracks', ({ user: { username } }, res, next) =>
  getUserTracks(username)
    .tap(userTracks => res.json(userTracks))
    .catch(next)
)

router.get('/tracks/playlist.pls', ({ user: { username } }, res, next) =>
  getTracksM3u(username)
    .tap(m3u => res.send(m3u))
    .catch(next)
)

router.post('/tracks/:id', ({ user: { username }, params: { id }, body: { heard } }, res, next) => {
  setTrackHeard(id, username, heard)
    .tap(() => res.send())
    .catch(next)
})

router.patch('/tracks/', ({ user: { username }, body: { heard }, res, next }) => {
  setAllHeard(username, heard)
    .tap(() => res.send())
    .catch(next)
})

// TODO: add genre to database?
router.post('/ignores/genres', ({ user: { username }, body: { artistId, storeId, genre } }, res, next) => {})

router.post('/ignores/labels', ({ user: { username }, body }, res, next) =>
  addArtistsOnLabelsToIgnore(username, body)
    .tap(() => res.send())
    .catch(next)
)

const tracksHandler = type => async (req, res, next) => {
  try {
    console.log('Start processing received tracks')

    let addedTracks = []
    for (const track of req.body) {
      const trackId = await addStoreTrackToUsers(req.headers['x-multi-store-player-store'], [req.user.id], track, type)
      addedTracks.push(`${apiURL}/tracks/${trackId}`)
    }

    res.status(201).send(addedTracks)
  } catch (e) {
    next(e)
  }
}

router.post('/tracks', tracksHandler('new'))
router.post('/purchased', tracksHandler('purchased'))

router.post('/follows/artists', async ({ user: { id: userId }, body, headers }, res, next) => {
  try {
    const storeUrl = headers['x-multi-store-player-store']
    const stores = await queryStores()

    let addedArtists = []
    for (const artist of body) {
      let artistDetails = { url: (storeUrl !== undefined ? storeUrl : '') + artist.url }
      const matchingStore = stores.find(({ url, artistRegex }) => {
        const urlMatch = artistDetails.url.match(artistRegex)
        if (urlMatch !== null) {
          artistDetails.id = urlMatch[1]
        }
        return storeUrl === url || artistDetails.id !== undefined
      })

      console.log('foo', matchingStore)

      if (matchingStore === null) {
        return next(BadRequest(`Invalid artist URL ${artist.url}`))
      }

      if (artist.name === undefined) {
        console.log(`Fetching artist name from ${artist.url}`)
        artistDetails.name = await storeModules[matchingStore.name].logic.getArtistName(artist.url)
      }

      const { artistId, followId } = await addStoreArtistToUser(matchingStore.url, userId, artistDetails)
      addedArtists.push({
        artist: `${apiURL}/artists/${artistId}`,
        follow: `${apiURL}/users/${userId}/follows/artists/${followId}`
      })
    }

    res.status(201).send(addedArtists)
  } catch (e) {
    next(e)
  }
})

router.post('/follows/labels', async ({ user: { id: userId }, body, headers }, res, next) => {
  try {
    const storeUrl = headers['x-multi-store-player-store']
    const stores = await queryStores()

    let addedLabels = []
    for (const label of body) {
      let labelDetails = { url: (storeUrl !== undefined ? storeUrl : '') + label.url }
      const matchingStore = stores.find(({ url, labelRegex }) => {
        const urlMatch = labelDetails.url.match(labelRegex)
        if (urlMatch !== null) {
          labelDetails.id = urlMatch[1]
        }
        return storeUrl === url || labelDetails.id !== undefined
      })

      if (matchingStore === null) {
        return next(BadRequest(`Invalid label URL ${label.url}`))
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

    res.status(201).send(addedLabels)
  } catch (e) {
    next(e)
  }
})

router.get('/follows/artists', async ({ user: { id: authUserId } }, res, next) => {
  const artistFollows = await getUserArtistFollows(authUserId)
  res.send(artistFollows)
})

router.delete('/follows/artists/:id', async ({ params: { id }, user: { id: authUserId } }, res, next) => {
  try {
    await removeArtistWatchFromUser(authUserId, id)
    res.status(204).send()
  } catch (e) {
    next(e)
  }
})

router.get('/follows/labels', async ({ user: { id: authUserId } }, res, next) => {
  const labelFollows = await getUserLabelFollows(authUserId)
  res.send(labelFollows)
})

router.delete('/follows/labels/:id', async ({ params: { id }, user: { id: authUserId } }, res, next) => {
  try {
    await removeLabelWatchFromUser(authUserId, id)
    res.status(204).send()
  } catch (e) {
    next(e)
  }
})

router.get('/follows/playlists', async ({ user: { id: authUserId } }, res, next) => {
  const playlists = await getUserPlaylistFollows(authUserId)
  res.send(playlists)
})

router.delete('/follows/playlists/:id', async ({ params: { id }, user: { id: authUserId } }, res, next) => {
  try {
    await removePlaylistFollowFromUser(authUserId, id)
    res.status(204).send()
  } catch (e) {
    next(e)
  }
})

router.post('/follows/playlists', async ({ user: { id: userId }, body }, res, next) => {
  try {
    const stores = await queryStores()

    let addedPlaylists = []
    for (const { url: playlistUrl } of body) {
      const matchingStore = stores.find(({ playlistRegex }) => playlistUrl.match(playlistRegex))

      if (matchingStore === null) {
        return next(BadRequest('Invalid playlist URL'))
      }

      const { name: storeName } = matchingStore
      const storeModule = storeModules[storeName]
      const { playlistId, followId } = await storeModule.logic.addPlaylistFollow(userId, playlistUrl)
      addedPlaylists.push({
        playlist: `${apiURL}/playlists/${playlistId}`,
        follow: `${apiURL}/users/${userId}/follows/playlists/${followId}`
      })
    }
    res.send(addedPlaylists)
  } catch (e) {
    next(e)
  }
})

module.exports = router

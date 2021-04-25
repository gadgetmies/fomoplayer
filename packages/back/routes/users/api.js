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

const { queryStoreRegexes } = require('../shared/db/store.js')

const router = require('express-promise-router')()
const { apiURL } = require('../../config')
const { BadRequest } = require('../shared/httpErrors')

const {} = require('./logic')

const { modules: storeModules } = require('../stores/index.js')

router.get('/tracks', ({ user: { username } }, res) => getUserTracks(username).tap(userTracks => res.json(userTracks)))

router.get('/tracks/playlist.pls', ({ user: { username } }, res) => getTracksM3u(username).tap(m3u => res.send(m3u)))

router.post('/tracks/:id', ({ user: { username }, params: { id }, body: { heard } }, res) => {
  setTrackHeard(id, username, heard).tap(() => res.send())
})

router.patch('/tracks/', ({ user: { username }, body: { heard }, res }) => {
  setAllHeard(username, heard).tap(() => res.send())
})

// TODO: add genre to database?
router.post('/ignores/genres', ({ user: { username }, body: { artistId, storeId, genre } }, res) => {})

router.post('/ignores/labels', ({ user: { username }, body }, res) =>
  addArtistsOnLabelsToIgnore(username, body).tap(() => res.send())
)

const tracksHandler = type => async (req, res) => {
  console.log('Start processing received tracks')

  let addedTracks = []
  for (const track of req.body) {
    const trackId = await addStoreTrackToUsers(req.headers['x-multi-store-player-store'], [req.user.id], track, type)
    addedTracks.push(`${apiURL}/tracks/${trackId}`)
  }

  res.status(201).send(addedTracks)
}

router.post('/tracks', tracksHandler('new'))
router.post('/purchased', tracksHandler('purchased'))

router.post('/follows/artists', async ({ user: { id: userId }, body, headers }, res) => {
  // TODO: try first to find from db

  const storeUrl = headers['x-multi-store-player-store']
  const storesRegexes = await queryStoreRegexes()

  let addedArtists = []
  for (const artist of body) {
    let artistDetails = { url: (storeUrl !== undefined ? storeUrl : '') + artist.url }
    const matchingStore = storesRegexes.find(({ url, regex: { artist: artistRegex } }) => {
      const urlMatch = artistDetails.url.match(artistRegex)
      if (urlMatch !== null) {
        artistDetails.id = urlMatch[1]
      }
      return storeUrl === url || artistDetails.id !== undefined
    })

    if (matchingStore === null) {
      throw new BadRequest(`Invalid artist URL ${artist.url}`)
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
})

router.post('/follows/labels', async ({ user: { id: userId }, body, headers }, res) => {
  // TODO: try first to find from db

  const storeUrl = headers['x-multi-store-player-store']
  const storeRegexes = await queryStoreRegexes()

  let addedLabels = []
  for (const label of body) {
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

  res.status(201).send(addedLabels)
})

router.get('/follows/artists', async ({ user: { id: authUserId } }, res) => {
  const artistFollows = await getUserArtistFollows(authUserId)
  res.send(artistFollows)
})

router.delete('/follows/artists/:id', async ({ params: { id }, user: { id: authUserId } }, res) => {
  await removeArtistWatchFromUser(authUserId, id)
  res.status(204).send()
})

router.get('/follows/labels', async ({ user: { id: authUserId } }, res) => {
  const labelFollows = await getUserLabelFollows(authUserId)
  res.send(labelFollows)
})

router.delete('/follows/labels/:id', async ({ params: { id }, user: { id: authUserId } }, res) => {
  await removeLabelWatchFromUser(authUserId, id)
  res.status(204).send()
})

router.get('/follows/playlists', async ({ user: { id: authUserId } }, res) => {
  const playlists = await getUserPlaylistFollows(authUserId)
  res.send(playlists)
})

router.delete('/follows/playlists/:id', async ({ params: { id }, user: { id: authUserId } }, res) => {
  await removePlaylistFollowFromUser(authUserId, id)
  res.status(204).send()
})

router.post('/follows/playlists', async ({ user: { id: userId }, body }, res) => {
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
  res.send(addedPlaylists)
})

module.exports = router

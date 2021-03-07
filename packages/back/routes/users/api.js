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
  removeLabelWatchesFromUser,
  setAllHeard,
  setTrackHeard
} = require('./logic')

const getStores = require('../shared/db/store.js')

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

router.post('/follows/artists', async ({ user, body, headers }, res, next) => {
  try {
    console.log('Start processing received artists')
    const storeUrl = headers['x-multi-store-player-store']

    await removeArtistWatchesFromUser(storeUrl, user)
    let addedArtists = []
    for (const artist of body) {
      const artistId = await addStoreArtistToUser(storeUrl, user, artist)
      addedArtists.push(`${apiURL}/artists/${artistId}`)
    }

    res.status(201).send(addedArtists)
  } catch (e) {
    next(e)
  }
})

router.post('/follows/labels', async ({ user, body, headers }, res, next) => {
  try {
    console.log('Start processing received labels')
    const storeUrl = headers['x-multi-store-player-store']

    await removeLabelWatchesFromUser(storeUrl, user)
    let addedLabels = []
    for (const label of body) {
      const labelId = await addStoreLabelToUser(storeUrl, user, label)
      addedLabels.push(`${apiURL}/labels/${labelId}`)
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

router.get('/follows/playlists', async ({ user: { id: authUserId } }, res, next) => {
  const playlists = await getUserPlaylistFollows(authUserId)
  res.send(playlists)
})

router.get('/follows/labels', async ({ user: { id: authUserId } }, res, next) => {
  const labelFollows = await getUserLabelFollows(authUserId)
  res.send(labelFollows)
})

router.post('/follows/playlists', async ({ user: { id: authUserId }, body: { url: playlistUrl } }, res, next) => {
  const stores = await getStores()
  const matchingStore = stores.find(({ playlistRegex }) => playlistUrl.match(playlistRegex))

  if (matchingStore === null) {
    throw new BadRequest('Invalid playlist URL')
  }

  const { name: storeName } = matchingStore
  const storeModule = storeModules[storeName]
  storeModule.han

  res.send({
    playlist: `${apiURL}/playlists/${playlistId}`,
    follow: `${apiURL}/users/${authUserId}/follows/playlists/${followId}`
  })
})

module.exports = router

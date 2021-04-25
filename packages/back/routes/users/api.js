const {
  addArtistsOnLabelsToIgnore,
  addStoreTracksToUser,
  getTracksM3u,
  getUserArtistFollows,
  getUserLabelFollows,
  getUserPlaylistFollows,
  getUserTracks,
  removeArtistWatchFromUser,
  removeLabelWatchFromUser,
  removePlaylistFollowFromUser,
  setAllHeard,
  setTrackHeard,
  addArtistFollows,
  addLabelFollows,
  addPlaylistFollows
} = require('./logic')

const router = require('express-promise-router')()
const { apiURL } = require('../../config')

const {} = require('./logic')

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

const tracksHandler = type => async (
  { body: tracks, headers: { 'x-multi-store-player-store': storeUrl }, user: { id: userId } },
  res
) => {
  const addedTracks = await addStoreTracksToUser(storeUrl, type, tracks, userId, {
    operation: 'tracksHandler',
    type,
    storeUrl
  })
  res.status(201).send(addedTracks)
}

router.post('/tracks', tracksHandler('new'))
router.post('/purchased', tracksHandler('purchased'))

router.post('/follows/artists', async ({ user: { id: userId }, body, headers }, res) => {
  const storeUrl = headers['x-multi-store-player-store']
  const addedArtists = await addArtistFollows(storeUrl, body, userId, { operation: '/follows/artists', storeUrl })
  res.status(201).send(addedArtists)
})

router.post('/follows/labels', async ({ user: { id: userId }, body, headers }, res) => {
  const storeUrl = headers['x-multi-store-player-store']
  const addedLabels = await addLabelFollows(storeUrl, body, userId, { operation: '/follows/labels', storeUrl })
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
  const addedPlaylists = await addPlaylistFollows(body, userId, { operation: '/follows/playlists' })
  res.send(addedPlaylists)
})

module.exports = router

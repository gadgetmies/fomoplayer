const bodyParser = require('body-parser')

const router = require('express').Router()
const {
  queryUserTracks,
  setTrackHeard,
  setAllHeard,
  getTracksM3u,
  addArtistsOnLabelsToIgnore,
  getStorePreviewRedirectForTrack,
  addStoreTrackToUsers,
  addStoreArtistToUser,
  addStoreLabelToUser,
  removeArtistWatchesFromUser,
  removeLabelWatchesFromUser
} = require('./logic.js')

const { apiURL } = require('../config.js')

router.use(bodyParser.json())

router.get('/tracks/:id/preview.:format', async (req, res, next) => {
  const { params: { id, format, offset } } = req
  try {
    res.redirect(await getStorePreviewRedirectForTrack(id, format, offset))
  } catch(e) {
    console.error(e)
    next()
  }
})

router.get('/tracks', ({ user: { username } }, res, next) =>
  queryUserTracks(username)
    .tap(userTracks => res.json(userTracks))
    .catch(next)
)

router.get('/tracks/playlist.pls', ({ user: { username } }, res, next) =>
  getTracksM3u(username)
    .tap(m3u => res.send(m3u))
    .catch(next)
)

router.get('/tracks/:id', ({ user: { username }, params: { id } }, res, next
) => {
  // TODO
  res.send(JSON.stringify({}))
})

router.post('/tracks/:id', ({ user: { username }, params: { id }, body: { heard } }, res, next) => {
  // language=PostgreSQL
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

router.use('/stores', require('./stores/index.js'))

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

router.post('/artists', async ({ user, body, headers }, res, next) => {
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

router.post('/labels', async ({ user, body, headers }, res, next) => {
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

module.exports = router

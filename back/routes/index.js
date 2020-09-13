const bodyParser = require('body-parser')

const router = require('express').Router()
const {
  queryUserTracks,
  setTrackHeard,
  setAllHeard,
  getTracksM3u,
  addArtistsOnLabelsToIgnore,
  getStorePreviewRedirectForTrack
} = require('./logic.js')

router.use(bodyParser.json())

router.get('/tracks/:id/preview.:format', ({ params: { id, format, skip } }, res, next) =>
  getStorePreviewRedirectForTrack(id, format, skip)
    .tap(url => res.redirect(url))
    .catch(next)
)

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
router.post('/ignores/genres', ({ user: { username }, body: { artistId, storeId, genre } }, res, next) => {
})

router.post('/ignores/labels', ({ user: { username }, body }, res, next) =>
  addArtistsOnLabelsToIgnore(username, body)
    .tap(() => res.send())
    .catch(next)
)

router.use('/stores', require('./stores/index.js'))

module.exports = router

const bodyParser = require('body-parser')
const passport = require('passport')

const router = require('express').Router()
const {
  queryUserTracks,
  setTrackHeard,
  getTracksM3u,
  addArtistsOnLabelsToIgnore,
  getStorePreviewRedirectForTrack
} = require('./logic.js')

router.get('/logout', function(req, res) {
  req.logout()
})

const ensureAuthenticated = (req, res, next) => {
  req.isAuthenticated() ? next() : res.status(401).end()
}

router.use(bodyParser.json())
router.post('/login', passport.authenticate('local'), (req, res) => res.status(204).end())

router.get('/tracks/:id/preview.:format', ({ params: {id, format}}, res, next) => 
  getStorePreviewRedirectForTrack(id, format)
    .tap(url => res.redirect(url))
    .catch(next)
)

router.get('/tracks', ensureAuthenticated, ({ user: { username } }, res, next) =>
  queryUserTracks(username)
    .tap(userTracks => res.json(userTracks))
    .catch(next)
)

router.get('/tracks.pls', ensureAuthenticated, ({ user: { username } }, res, next) =>
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

// TODO: add genre to database?
router.post('/ignore/genre', ({ user: { username }, body: { artistId, storeId, genre } }, res, next) => {})

router.post('/ignore/label', ({ user: { username }, body }, res, next) =>
  addArtistsOnLabelsToIgnore(username, body)
    .tap(() => res.send())
    .catch(next)
)

module.exports = router

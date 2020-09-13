const router = require('express').Router()
const bodyParser = require('body-parser')
const { initWithSessionAsync } = require('./bandcamp-api.js')
const R = require('ramda')

const {
  refreshUserTracks,
  hasValidSession,
  getSession,
  setSession,
  setFanId,
  getFanId,
  deleteSession,
  getTracks,
  addTrackToCart,
  getTracksInCarts,
  getPreviewUrl
} = require('./logic.js')

router.use(bodyParser.json())

router.get('/tracks', ({user, query: {older_than}}, res, next) => {
  return getTracks(user.username)
      .tap(tracks => res.send(tracks))
      .catch(next)
  }
)

router.get('/tracks/:id/preview.:format', ({ user: { username }, params: { id, format } }, res, next) =>
  getPreviewUrl(username, id, format)
    .then(url => res.redirect(url))
    .catch(next)
)

const loginWithCookie = cookie => {
  cookieObject = R.fromPairs(cookie.split('; ').map(x => x.split('=')))
  return initWithSessionAsync(cookieObject)
}

router.post('/login', ({body: {client_id, identity, session, cookie}, user}, res, next) => {
  if (getSession(user.username)) {
    console.log(`using session for user ${user.username}`)
    return res.send('ok')
  } else {
    return (cookie ?
      loginWithCookie(cookie) :
      initWithSessionAsync({client_id, identity, session}))
      .tap(session => {
        // console.log(`storing session for user ${user.username}`)
        setSession(user.username, session)
      })
      .tap(session => {
        session.getFanIdAsync()
          .tap(fanId => setFanId(user.username, fanId))
      })
      .tap(() => res.send('ok'))
      .catch(next)
  }
})

router.post('/refresh', ({user}, res) => {
  res.send('ok')
  return refreshUserTracks(user.username)
    .catch(err => console.error(`Refresh of Bandcamp tracks for user ${user.username} failed`, err))
  }
)

router.post('/carts/default', ({body: {trackId}, user}, res, next) =>
  addTrackToCart(trackId, user)
    .then(() => res.send('ok'))
    .catch(next)
)

router.post('/logout', ({user: {username}}, res) => {
  deleteSession(username)
  return res.send('ok')
})

router.get('/session-valid', ({user: {username} = {username: undefined}}, res) => {
  return res.send({
    validSession: hasValidSession(username)
  })
})

router.get('/carts', ({user}, res, next) =>
  getTracksInCarts(user)
    .catch((e) => console.error('Getting Bandcamp carts failed', e))
    .tap(idsOfItemsInCarts => res.send(idsOfItemsInCarts))
    .catch(next)
)

module.exports = router

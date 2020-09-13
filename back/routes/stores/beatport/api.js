const router = require('express').Router()
const bodyParser = require('body-parser')
const bpApi = require('bp-api')
const R = require('ramda')

const {
  getSessionForRequest,
  refreshUserTracks,
  hasValidSession,
  getSession,
  setSession,
  deleteSession,
  getPreviewUrl
} = require('./logic.js')

router.get('/download/:downloadId', (req, res, next) => {
  const {downloadId} = req.params
  getSessionForRequest(req.user)
    .downloadTrackWithIdAsync(downloadId)
    .tap(request => req.pipe(request).pipe(res))
    .catch(next)
})

router.use(bodyParser.json())

router.get('/', ({user}, res, next) =>
  getSessionForRequest(user)
    .getMyBeatportAsync()
    .then(results => res.send(results))
    .catch(next)
)

router.get('/tracks/:id/preview.:format', ({ params: { id, format } }, res, next) =>
  getPreviewUrl(id, format)
    .then(url => res.redirect(url))
    .catch(next)
)

router.get('/tracks', ({user, query: {page}}, res, next) =>
  getSessionForRequest(user)
    .getMyBeatportTracksAsync(page)
    .tap(tracks => res.send(tracks))
    .catch(next)
)

router.get('/carts', ({user}, res, next) =>
  getSessionForRequest(user)
    .getItemsInCartsAsync()
    .tap(a => console.log('carts', a))
    .tap(idsOfItemsInCarts => res.send(idsOfItemsInCarts.map(String)))
    .catch(next)
)

const beatportDefaultCart = 'cart'
router.post('/carts/default', ({body: {trackId}, user}, res, next) =>
  getSessionForRequest(user)
    .addTrackToCartAsync(parseInt(trackId, 10), beatportDefaultCart)
    .tap(() => res.status(204).send())
    .catch(next)
)

router.post('/carts/:cartId', ({body: {trackId}, params: {cartId}, user}, res, next) =>
  getSessionForRequest(user)
    .addTrackToCartAsync(parseInt(trackId, 10), cartId)
    .tap(() => res.status(204).send())
    .catch(next)
)

router.delete('/carts/:cartId', ({body: {trackId}, params: {cartId}, user}, res, next) =>
  getSessionForRequest(user)
    .removeTrackFromCartAsync(parseInt(trackId, 10), cartId)
    .tap(() => res.status(204).send())
    .catch(next)
)

router.get('/downloads', ({user}, res, next) =>
  getSessionForRequest(user)
    .getAvailableDownloadIdsAsync()
    .catch(next)
)

const loginWithCookie = cookie => {
  cookieObject = R.fromPairs(cookie.split('; ').map(x => x.split('=')))
  return bpApi.initAsync(cookieObject.session, cookieObject._csrf_token)
}

router.post('/login', ({body: {username, password, sessionCookieValue, csrfToken, cookie}, user}, res, next) => {
  if (getSession(user.username)) {
    console.log(`using session for user ${user.username}`)
    return res.send('ok')
  } else {
    (cookie ?
      loginWithCookie(cookie):
      username && password ?
        bpApi.initAsync(username, password) :
        bpApi.initWithSessionAsync(sessionCookieValue, csrfToken)
    ).then(session => {
      // console.log(`storing session for user ${user.username}`)
      setSession(user.username, session)
    })
      .tap(() => res.send('ok'))
      .catch(next)
  }
})

router.post('/refresh', ({user}, res, next) => refreshUserTracks(user.username)
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

module.exports = router

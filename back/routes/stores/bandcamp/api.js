const router = require('express').Router()
const bodyParser = require('body-parser')
const { initWithSessionAsync } = require('./bandcamp-api.js')
const R = require('ramda')
const { log, error } = require('./logger')

const {
  startRefreshUserTracks,
  getRefreshStatus,
  hasValidSession,
  getSession,
  setSession,
  setFanId,
  getFanId,
  deleteSession,
  getTracks,
  addTrackToCart,
  getTracksInCarts,
  getPreviewUrl,
  errors: { SessionNotFoundError }
} = require('./logic.js')

const logout = username => deleteSession(username)

router.use(bodyParser.json())

router.get('/tracks', ({ user: { username }, query: { older_than } }, res, next) => {
  return getTracks(username)
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

router.post('/login', async ({ body: { client_id, identity, session, cookie }, user: { username } }, res, next) => {
  log(`Logging in ${username}`)
  if (hasValidSession(username)) {
    logout(username)
  } else {
    try {
      let session
      if (cookie) {
        session = await loginWithCookie(cookie)
      } else {
        session = await initWithSessionAsync({ client_id, identity, session })
      }

      log(`Bandcamp: Storing session for user ${username}`)
      setSession(username, session)
      const fanId = await session.getFanIdAsync()
      setFanId(username, fanId)
      res.send('ok')
    } catch (e) {
      next(e)
    }
  }
})

router.get('/refresh/:uuid', async ({ user: {username}, params: { uuid } }, res, next) => {
  try {
    res.send(await getRefreshStatus(username, uuid))
  } catch (e) {
    error(e)
    next(e)
  }
})

router.post('/refresh', async ({ user: {username} }, res, next) => {
  try {
    const uuid = await startRefreshUserTracks(username)
    return res.send({ uuid })
  } catch (e) {
    error(`Refresh tracks for user ${username} failed`, e)
    return next(e)
  }
})

router.post('/carts/default', ({ body: { trackId }, user }, res, next) =>
  addTrackToCart(trackId, user)
    .then(() => res.send('ok'))
    .catch(next)
)

router.post('/logout', ({ user: { username } }, res) => {
  log(`Logging out ${username}`)
  logout(username)
  return res.send('ok')
})

router.get('/session/', ({ user: { username } = { username: undefined } }, res) => {
  return res.send({
    valid: hasValidSession(username)
  })
})

router.get('/carts', ({ user }, res, next) =>
  getTracksInCarts(user)
    .catch((e) => error('Getting carts failed', e))
    .tap(idsOfItemsInCarts => res.send(idsOfItemsInCarts))
    .catch(next)
)

router.use((err, req, res, next) => {
  if (err instanceof SessionNotFoundError) {
    return res.status(403).send('Not logged in to Bandcamp')
  }
  next(err)
})

module.exports = router

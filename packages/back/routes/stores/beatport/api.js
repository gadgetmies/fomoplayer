const router = require('express').Router()
const bpApi = require('bp-api')
const { log, error } = require('./logger')

const {
  getSessionForRequest,
  startRefreshUserTracks,
  getRefreshStatus,
  hasValidSession,
  getSession,
  setSession,
  deleteSession,
  getPreviewUrl,
  insertDownloadedTracksToUser
} = require('./logic.js')

router.get('/download/:downloadId', (req, res, next) => {
  const { downloadId } = req.params
  getSessionForRequest(req.user)
    .downloadTrackWithIdAsync(downloadId)
    .tap(request => req.pipe(request).pipe(res))
    .catch(next)
})

router.post('/downloaded', async ({ body: tracks, user }, res, next) => {
  user = 'testuser'
  try {
    await insertDownloadedTracksToUser(user, tracks)
    res.status(204).send()
  } catch (e) {
    next(e)
  }
})

router.get('/', ({ user }, res, next) =>
  getSessionForRequest(user)
    .getMyBeatportAsync()
    .then(results => res.send(results))
    .catch(next)
)

router.get('/tracks/:id/preview.:format', ({ params: { id, format } }, res, next) =>
  getPreviewUrl(id, format)
    .then(url => res.send(url))
    .catch(next)
)

router.get('/tracks', ({ user, query: { page } }, res, next) =>
  getSessionForRequest(user)
    .getMyBeatportTracksAsync(page)
    .tap(tracks => res.send(tracks))
    .catch(next)
)

router.get('/carts', ({ user }, res, next) =>
  getSessionForRequest(user)
    .getItemsInCartsAsync()
    .tap(idsOfItemsInCarts => res.send(idsOfItemsInCarts.map(String)))
    .catch(next)
)

const beatportDefaultCart = 'cart'
router.post('/carts/default', ({ body: { trackId }, user }, res, next) =>
  getSessionForRequest(user)
    .addTrackToCartAsync(parseInt(trackId, 10), beatportDefaultCart)
    .tap(() => res.status(204).send())
    .catch(next)
)

router.post('/carts/:cartId', ({ body: { trackId }, params: { cartId }, user }, res, next) =>
  getSessionForRequest(user)
    .addTrackToCartAsync(parseInt(trackId, 10), cartId)
    .tap(() => res.status(204).send())
    .catch(next)
)

router.delete('/carts/:cartId', ({ body: { trackId }, params: { cartId }, user }, res, next) =>
  getSessionForRequest(user)
    .removeTrackFromCartAsync(parseInt(trackId, 10), cartId)
    .tap(() => res.status(204).send())
    .catch(next)
)

router.get('/downloads', ({ user }, res, next) =>
  getSessionForRequest(user)
    .getAvailableDownloadIdsAsync()
    .catch(next)
)

router.post('/login', ({ body: { username, password, sessionCookieValue, csrfToken, cookie }, user }, res, next) => {
  if (getSession(user.username)) {
    log(`Using session for user ${user.username}`)
    return res.send('ok')
  } else {
    ;(username && password
      ? bpApi.initAsync(username, password)
      : bpApi.initWithSessionAsync(sessionCookieValue, csrfToken)
    )
      .then(session => {
        log(`Storing session for user ${user.username}`)
        setSession(user.username, session)
      })
      .tap(() => res.send('ok'))
      .catch(next)
  }
})

router.post('/refresh', async ({ user: { username } }, res, next) => {
  try {
    const uuid = await startRefreshUserTracks(username)
    return res.send({ uuid })
  } catch (e) {
    error(`Refresh tracks for user ${username} failed`, e)
    return next(e)
  }
})

router.get('/refresh/:uuid', async ({ user: { username }, params: { uuid } }, res, next) => {
  try {
    res.send(await getRefreshStatus(username, uuid))
  } catch (e) {
    error(e)
    next(e)
  }
})

router.post('/logout', ({ user: { username } }, res) => {
  deleteSession(username)
  return res.send('ok')
})

router.get('/session/', ({ user: { username } = { username: undefined } }, res) => {
  return res.send({
    valid: hasValidSession(username)
  })
})

module.exports = router

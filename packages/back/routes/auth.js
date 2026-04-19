const router = require('express').Router()
const passport = require('passport')
const { frontendURL } = require('../config.js')
const { getAuthorizationUrl, requestTokens, storeName: spotifyStoreName } = require('../routes/shared/spotify')
const { upsertUserAuthorizationTokens } = require('./db')
const logger = require('fomoplayer_shared').logger(__filename)

const isSafeRedirectPath = (url, baseURL) => {
  if (!url) return false
  if (url.startsWith('//') || url.startsWith('http://') || url.startsWith('https://')) {
    try {
      return new URL(url).origin === new URL(baseURL).origin
    } catch {
      return false
    }
  }
  if (url.includes('\\')) return false
  return url.startsWith('/')
}

const logout = (req, res, next) => {
  req.logout((err) => {
    if (err) {
      next('Logout failed. Please contact an admin.')
    } else {
      res.status(204).send()
    }
  })
}

router.post('/logout', logout)
router.get('/logout', logout)

router.get('/login/google', (req, res, next) => {
  req.session.inviteCode = req.query.invite_code
  return passport.authenticate('openidconnect', {
    state: { returnURL: req.query.returnURL },
  })(req, res, next)
})

// TODO: What should the failureRedirect point to?
router.get(
  '/login/google/return',
  passport.authenticate('openidconnect', { failureRedirect: `${frontendURL}/?loginFailed=true` }),
  (req, res) => {
    const returnURL = req.authInfo?.state?.returnURL
    res.redirect(isSafeRedirectPath(returnURL, frontendURL) ? returnURL : frontendURL)
  },
)

router.get('/spotify', async ({ user: { id: userId }, query }, res) => {
  const authorizationUrl = getAuthorizationUrl(query.path, query.write === 'true')
  res.redirect(authorizationUrl)
})

router.get('/spotify/callback', async ({ user: { id: userId }, query: { code, state } }, res) => {
  const [path] = Array.from(new URLSearchParams(decodeURIComponent(state)).values())
  try {
    const result = await requestTokens(code)
    const { expires_in, access_token, refresh_token, scope } = result.body
    await upsertUserAuthorizationTokens(
      userId,
      spotifyStoreName,
      access_token,
      refresh_token,
      expires_in,
      scope.split(' '),
    )
  } catch (e) {
    logger.error(`Spotify callback handling failed: ${e.toString()}`)
  }
  const safePath = isSafeRedirectPath(path, frontendURL) ? path : ''
  res.redirect(`${frontendURL}${safePath}`)
})

if (process.env.NODE_ENV !== 'production') {
  router.post(
    '/login',
    (req, res, next) => {
      next()
    },
    passport.authenticate(['local']),
    (req, res) => res.status(204).end(),
  )
}

module.exports = router

const router = require('express').Router()
const passport = require('passport')
const { frontendURL } = require('../config.js')
const { getAuthorizationUrl, requestTokens, storeName: spotifyStoreName } = require('./shared/spotify')
const { upsertUserAuthorizationTokens } = require('./db')
const logger = require('../logger')(__filename)

const logout = (req, res, next) => {
  req.logout(err => {
    if (err) {
      next('Logout failed. Please contact an admin.')
    } else {
      res.status(204).send()
    }
  })
}

router.post('/logout', logout)
router.get('/logout', logout)

router.get('/login/google', passport.authenticate('openidconnect'))

// TODO: What should the failureRedirect point to?
router.get(
  '/login/google/return',
  passport.authenticate('openidconnect', { failureRedirect: `${frontendURL}/auth/login` }),
  function(req, res) {
    res.redirect(`${frontendURL}`)
  }
)

router.get('/spotify', async ({ user: { id: userId } }, res) => {
  const authorizationUrl = getAuthorizationUrl()
  res.redirect(authorizationUrl)
})

router.get('/spotify/callback', async ({ user: { id: userId }, query: { code, state } }, res) => {
  try {
    const result = await requestTokens(code)
    const { expires_in, access_token, refresh_token } = result.body
    await upsertUserAuthorizationTokens(userId, spotifyStoreName, access_token, refresh_token, expires_in)
  } catch (e) {
    logger.error(e)
  }
  res.redirect(`${frontendURL}/settings`) // TODO: redirect to authorizations
})

module.exports = router

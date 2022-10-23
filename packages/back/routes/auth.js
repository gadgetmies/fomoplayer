const router = require('express').Router()
const passport = require('passport')
const { frontendURL } = require('../config.js')

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
router.get('/login/google/return', passport.authenticate('openidconnect', { failureRedirect: `${frontendURL}/auth/login` }), function(
  req,
  res
) {
  res.redirect(`${frontendURL}`)
})

module.exports = router

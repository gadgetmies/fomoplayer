const router = require('express').Router()
const passport = require('passport')

router.post('/logout', function(req, res) {
  req.logout()
  res.status(204).send()
})

router.get('/logout', function(req, res) {
  req.logout()
  res.status(204).send()
})

router.get('/login/google', passport.authenticate('openidconnect'))

router.get('/login/google/return', passport.authenticate('openidconnect', { failureRedirect: '/auth/login' }), function(
  req,
  res
) {
  console.log(req.path)
  res.redirect('/')
})

router.post('/login', passport.authenticate('local'), (req, res) => res.status(204).end())

router.get('/login', (req, res) => res.sendFile(path.join(__dirname + '/public/index.html')))

module.exports = router

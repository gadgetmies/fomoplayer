const router = require('express-promise-router')()
const { search } = require('./logic.js')
const { getUserPlaylists } = require('./logic')

router.get('/search', ({ query: { q } }, res) => search(q).then(results => res.send(results)))

router.get('/my-playlists', async ({ user: { id: userId } }, res) => {
  const playlists = await getUserPlaylists(userId)
  res.send(playlists)
})

module.exports = router

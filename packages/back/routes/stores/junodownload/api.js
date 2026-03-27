const router = require('express-promise-router')()
const { search, getTrackInfo } = require('./logic.js')

router.get('/search', ({ query: { q } }, res) => search(q).then((results) => res.send(results)))

router.get('/track', ({ query: { url } }, res) => {
  if (!url) return res.status(400).send({ error: 'url required' })
  return getTrackInfo(url).then((track) => res.send(track)).catch((e) => res.status(500).send({ error: e.message }))
})

module.exports = router

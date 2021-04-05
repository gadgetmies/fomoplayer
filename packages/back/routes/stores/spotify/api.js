const router = require('express').Router()
const { getPreviewUrl } = require('./logic')

router.get('/tracks/:id/preview.:format', ({ params: { id, format } }, res, next) =>
  getPreviewUrl(id, format)
    .then(url => res.send(url))
    .catch(next)
)

module.exports = router

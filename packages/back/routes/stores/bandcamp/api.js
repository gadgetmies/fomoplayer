const router = require('express').Router()

const { getPreviewDetails } = require('./logic.js')

router.get('/previews/:previewId', ({ user: { username }, params: { previewId } }, res, next) => {
  return getPreviewDetails(previewId)
    .then(url => res.send(url))
    .catch(next)
})

module.exports = router

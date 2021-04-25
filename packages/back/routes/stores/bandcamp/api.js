const router = require('express-promise-router')()

const { getPreviewDetails } = require('./logic.js')

router.get('/previews/:previewId', ({ user: { username }, params: { previewId } }, res) => {
  return getPreviewDetails(previewId)
    .then(url => res.send(url))
})

module.exports = router

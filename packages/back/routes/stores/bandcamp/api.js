const router = require('express-promise-router')()

const { getPreviewDetails } = require('./logic.js')

router.get('/previews/:previewId', ({ user: { id: userId }, params: { previewId } }, res) => {
  return getPreviewDetails(previewId).then(url => res.send(url))
})

module.exports = router

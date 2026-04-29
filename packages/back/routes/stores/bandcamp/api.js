const router = require('express-promise-router')()

const { getPreviewDetails, search } = require('./logic.js')

router.get('/previews/:previewId', ({ params: { previewId } }, res) => {
  return getPreviewDetails(previewId).then((url) => res.send(url))
})

router.get('/search', ({ query: q }, res) => search(q).then((results) => res.send(results)))

module.exports = router

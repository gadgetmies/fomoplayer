const router = require('express').Router()

const {
  getPreviewDetails,
} = require('./logic.js')

router.get('/previews/:previewId', ({ user: { username }, params: { previewId } }, res, next) => {
  console.log(JSON.stringify({previewId}, null, 2))
    return getPreviewDetails(previewId)
      .then(url => res.send(url))
      .catch(next)
  }
)

module.exports = router

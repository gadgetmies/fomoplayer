const router = require('express').Router()

const { getPreviewDetails, search } = require('./logic.js')

// ?refresh=true when the player could not play the URL it got; ?prefetch=true when it asks ahead for the next track.
router.get('/previews/:previewId', ({ params: { previewId }, query: { refresh, prefetch } }, res) => {
  return getPreviewDetails(previewId, { refresh: refresh === 'true', prefetch: prefetch === 'true' }).then((url) =>
    res.send(url),
  )
})

router.get('/search', ({ query: { q, type } }, res) => search(q, type).then((results) => res.send(results)))

module.exports = router

const bodyParser = require('body-parser')

const router = require('express-promise-router')()
const { getPreview, searchForTracks, getFollowDetails } = require('./logic.js')
const { Unauthorized } = require('./shared/httpErrors')
const adminRouter = require('./admin/index.js')
const { ensureAuthenticated } = require('./shared/auth.js')
const logRouter = require('./log/index.js')
const logger = require('fomoplayer_shared').logger(__filename)
const { getEntityDetails, getEmbeddingImage } = require('./logic')

router.use(bodyParser.json())

router.get('/tracks/:id/preview.:format', async ({ params: { id, format, offset }, query: { store: stores } }, res) => {
  res.redirect(await getPreview(id, stores, format, offset))
})

router.get('/tracks/:id/embedding.png', async ({ params: { id } }, res) => {
  try {
    res.status(200)
    res.set('Content-Type', 'image/png')
    const found = await getEmbeddingImage(id, res)
    if (!found) {
      res.status(404).send('Not found')
      res.send()
    }
  } catch (e) {
    logger.error('Embedding image generation failed', e.toString())
    res.status(500)
    res.send()
  }
})

router.get('/tracks/:id', ({ user: { id: userId }, params: { id } }, res) => {
  // TODO
  res.send(JSON.stringify({}))
})

router.get('/tracks/', async ({ query: { q, store: stores }, user: { id: userId }, query: options }, res) => {
  res.send(await searchForTracks(q, { stores, userId, ...options }))
})

router.get('/artists/:id', async ({ params: { id } }, res) => {
  res.send(await getEntityDetails('artist', id))
})

router.get('/labels/:id', async ({ params: { id } }, res) => {
  res.send(await getEntityDetails('label', id))
})

router.get('/followDetails', async ({ query: { q, store: stores } }, res) => {
  res.send(await getFollowDetails(q, stores))
})

const usersRouter = require('./users/index.js')
router.use(
  '/users/:userId',
  ({ params: { userId: paramUserId }, user: { id: authUserId } }) => {
    if (Number(paramUserId) !== authUserId) {
      throw new Unauthorized('Unauthorized')
    }
  },
  usersRouter,
)

router.use('/log', ensureAuthenticated, logRouter)

router.use('/me/', usersRouter)
router.use('/admin/', adminRouter)

module.exports = router

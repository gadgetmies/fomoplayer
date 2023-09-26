const bodyParser = require('body-parser')

const router = require('express-promise-router')()
const { getPreview, searchForTracks, getFollowDetails } = require('./logic.js')
const { Unauthorized } = require('./shared/httpErrors')
const adminRouter = require('./admin/index.js')
const { ensureAuthenticated } = require('./shared/auth.js')

router.use(bodyParser.json())

router.get('/tracks/:id/preview.:format', async ({ params: { id, format, offset } }, res) => {
  res.redirect(await getPreview(id, format, offset))
})

router.get('/tracks/:id', ({ user: { id: userId }, params: { id } }, res) => {
  // TODO
  res.send(JSON.stringify({}))
})

router.get('/tracks/', async ({ query: { q }, user: { id: userId }, query: options }, res) => {
  res.send(await searchForTracks(q, { userId, ...options }))
})

router.use('/stores', require('./stores/index.js').router)

router.get('/followDetails', async ({ query: { q } }, res) => {
  res.send(await getFollowDetails(q))
})

const usersRouter = require('./users/index.js')
router.use(
  '/users/:userId',
  ({ params: { userId: paramUserId }, user: { id: authUserId } }) => {
    if (Number(paramUserId) !== authUserId) {
      throw new Unauthorized('Unauthorized')
    }
  },
  usersRouter
)

const logRouter = require('./log/index.js')
router.use(
  '/log',
  ensureAuthenticated,
  logRouter
)

router.use('/me/', usersRouter)
router.use('/admin/', adminRouter)

module.exports = router

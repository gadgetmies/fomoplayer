const bodyParser = require('body-parser')

const router = require('express-promise-router')()
const { getPreview, searchForTracks, getFollowDetails } = require('./logic.js')
const { Unauthorized } = require('./shared/httpErrors')

router.use(bodyParser.json())

router.get('/tracks/:id/preview.:format', async ({ params: { id, format, offset } }, res) => {
  res.redirect(await getPreview(id, format, offset))
})

router.get('/tracks/:id', ({ user: { username }, params: { id } }, res) => {
  // TODO
  res.send(JSON.stringify({}))
})

router.get('/tracks/', async ({ query: { q }, user: { username } }, res) => {
  res.send(await searchForTracks(q, username))
})

router.use('/stores', require('./stores/index.js').router)

router.get('/followDetails', async ({ query: { url } }, res) => {
  res.send(await getFollowDetails(url))
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
router.use('/me/', usersRouter)

module.exports = router

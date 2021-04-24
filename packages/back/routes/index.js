const bodyParser = require('body-parser')

const { getLongestPreviewForTrack, searchForTracks } = require('./logic.js')
const router = require('express-promise-router')()
const { Unauthorized } = require('./shared/httpErrors')

router.use(bodyParser.json())

router.get('/tracks/:id/preview.:format', async (req, res) => {
  const {
    params: { id, format, offset }
  } = req
  const { storeCode, storeTrackId } = await getLongestPreviewForTrack(id, format, offset)
  const { getPreviewUrl } = require(`./stores/${storeCode}/logic.js`)
  res.redirect(await getPreviewUrl(storeTrackId, format))
})

router.get('/tracks/:id', ({ user: { username }, params: { id } }, res) => {
  // TODO
  res.send(JSON.stringify({}))
})

router.get('/tracks/', async ({ query: { q } }, res) => {
  res.send(await searchForTracks(q))
})

router.use('/stores', require('./stores/index.js').router)

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

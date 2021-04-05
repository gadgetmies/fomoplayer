const bodyParser = require('body-parser')

const router = require('express').Router()
const { getLongestPreviewForTrack, searchForTracks } = require('./logic.js')
const { Unauthorized } = require('./shared/httpErrors')

router.use(bodyParser.json())

router.get('/tracks/:id/preview.:format', async (req, res, next) => {
  const {
    params: { id, format, offset }
  } = req
  try {
    const { storeCode, storeTrackId } = await getLongestPreviewForTrack(id, format, offset)
    const { getPreviewUrl } = require(`./stores/${storeCode}/logic.js`)
    res.redirect(await getPreviewUrl(storeTrackId, format))
  } catch (e) {
    console.error(e)
    next()
  }
})

router.get('/tracks/:id', ({ user: { username }, params: { id } }, res, next) => {
  // TODO
  res.send(JSON.stringify({}))
})

router.get('/tracks/', async ({ query: { q } }, res, next) => {
  try {
    res.send(await searchForTracks(q))
  } catch (e) {
    console.error(e)
    next(e)
  }
})

router.use('/stores', require('./stores/index.js').router)

const usersRouter = require('./users/index.js')
router.use(
  '/users/:userId',
  ({ params: { userId: paramUserId }, user: { id: authUserId } }, res, next) => {
    if (Number(paramUserId) !== authUserId) {
      return next(new Unauthorized('Unauthorized'))
    }
    next()
  },
  usersRouter
)
router.use('/me/', usersRouter)

module.exports = router

const fs = require('fs')
const path = require('path')
const bodyParser = require('body-parser')
const expressPromiseRouter = require('express-promise-router')
const defaultConfig = require('../config')
const logger = require('fomoplayer_shared').logger(__filename)
const { verifyEmail, getCartDetails } = require('./logic.js')
const { queryAccountCount: defaultQueryAccountCount, addEmailToWaitingList: defaultAddEmailToWaitingList } = require('./db')

const createPublicRouter = ({
  config = defaultConfig,
  queryAccountCount = defaultQueryAccountCount,
  addEmailToWaitingList = defaultAddEmailToWaitingList,
} = {}) => {
  const router = expressPromiseRouter()
  router.use(bodyParser.json())

  router.get('/carts/:uuid', async ({ params: { uuid }, user, query: { since, offset, limit, store: stores } }, res) => {
    if (since !== undefined && Number.isNaN(new Date(since).getTime())) {
      return res.status(400).json({ error: 'Invalid since date' })
    }
    const cart = await getCartDetails(uuid, user?.id, stores, { since, offset, limit })
    if (cart === null) {
      return res.status(404).send()
    }
    res.send(cart)
  })

  router.use('/stores', require('./stores/index.js').router)

  const replaceAppUrl = (html) => html.replace(/APP_URL/g, config.frontendURL)
  const emailVerificationSuccessPage = replaceAppUrl(
    fs.readFileSync(path.resolve(__dirname, 'static/email_verification_success.html'), { encoding: 'utf8' }),
  )
  const emailVerificationFailPage = replaceAppUrl(
    fs.readFileSync(path.resolve(__dirname, 'static/email_verification_fail.html'), { encoding: 'utf8' }),
  )
  router.get('/verify-email/:verificationCode', async ({ params: { verificationCode } }, res) => {
    try {
      await verifyEmail(verificationCode)
      res.send(emailVerificationSuccessPage)
    } catch (e) {
      logger.error('Email verification failed', e)
      res.send(emailVerificationFailPage)
    }
  })

  router.get('/sign-up-available', async (_, res) => {
    if (config.isPreviewEnv) {
      return res.send({ available: false })
    }
    const accountCount = await queryAccountCount()
    return res.send({ available: config.maxAccountCount >= accountCount })
  })

  router.post('/join-waiting-list', async ({ body: { email } }, res) => {
    await addEmailToWaitingList(email)
    res.status(204).send()
  })

  return router
}

const router = createPublicRouter()
module.exports = router
module.exports.createPublicRouter = createPublicRouter

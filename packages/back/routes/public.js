const fs = require('fs')
const path = require('path')
const express = require('express')
const bodyParser = require('body-parser')
const defaultConfig = require('../config')
const logger = require('fomoplayer_shared').logger(__filename)
const { verifyEmail, getCartDetails } = require('./logic.js')
const { parsePage, parseStores, parseDate } = require('./shared/request-params')
const { CART_TRACKS_PAGE } = require('./shared/cart')
const { queryAccountCount: defaultQueryAccountCount, addEmailToWaitingList: defaultAddEmailToWaitingList } = require('./db')

const createPublicRouter = ({
  config = defaultConfig,
  queryAccountCount = defaultQueryAccountCount,
  addEmailToWaitingList = defaultAddEmailToWaitingList,
} = {}) => {
  const router = express.Router()
  router.use(bodyParser.json())

  router.get('/carts/:uuid', async ({ params: { uuid }, user, query: { since, offset, limit, store: stores } }, res) => {
    const page = parsePage({ offset, limit }, CART_TRACKS_PAGE)
    const filter = { since: parseDate('since', since), ...page }
    const cart = await getCartDetails(uuid, user?.id, parseStores(stores), filter)
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

  router.get('/health', (_, res) => res.json({ status: 'ok' }))

  // Sentry instrumentation smoke test. Triggers a synthetic error so the
  // operator can verify a real event reaches Sentry tagged `runtime: back`.
  // Gated by SENTRY_TEST_TOKEN so it's safe to leave deployed.
  router.get('/debug/sentry-test', (req, res) => {
    const token = process.env.SENTRY_TEST_TOKEN
    if (!token || req.query.token !== token) {
      return res.status(404).end()
    }
    throw new Error('sentry-test (back): synthetic error for instrumentation verification')
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

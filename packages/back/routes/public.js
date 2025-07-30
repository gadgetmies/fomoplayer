const fs = require('fs')
const path = require('path')
const bodyParser = require('body-parser')
const router = require('express-promise-router')()
const config = require('../config')
const logger = require('fomoplayer_shared').logger(__filename)

router.use(bodyParser.json())
const { verifyEmail, getCartDetails } = require('./logic.js')
const { queryAccountCount, addEmailToWaitingList } = require('./db')

router.get('/carts/:uuid', async ({ params: { uuid }, user, query: { since, offset, limit, store: stores } }, res) => {
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

router.get('/sign-up-available', async (req, res) => {
  const accountCount = await queryAccountCount()
  res.send({ available: config.maxAccountCount >= accountCount })
})

router.post('/join-waiting-list', async ({ body: { email } }, res) => {
  await addEmailToWaitingList(email)
  res.status(204).send()
})

module.exports = router

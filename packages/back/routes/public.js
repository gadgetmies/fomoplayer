const fs = require('fs')
const path = require('path')
const bodyParser = require('body-parser')
const router = require('express-promise-router')()
const config = require('../config')
const logger = require('../logger')(__filename)

router.use(bodyParser.json())
const { verifyEmail, getCartDetails } = require('./logic.js')

router.get('/carts/:uuid', async ({ params: { uuid } }, res) => {
  const cart = await getCartDetails(uuid)
  if (cart === null) {
    return res.status(404).send()
  }
  res.send(cart)
})

const replaceAppUrl = html => html.replace(/APP_URL/g, config.frontendURL)
const emailVerificationSuccessPage = replaceAppUrl(
  fs.readFileSync(path.resolve(__dirname, 'static/email_verification_success.html'), { encoding: 'utf8' })
)
const emailVerificationFailPage = replaceAppUrl(
  fs.readFileSync(path.resolve(__dirname, 'static/email_verification_fail.html'), { encoding: 'utf8' })
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

module.exports = router

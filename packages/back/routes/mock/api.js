const logger = require('../../logger')(__filename)
const router = require('express-promise-router')()

router.use('/email/*', ({ headers, body }, res) => {
  logger.debug('Received email sending request', { headers, body })
  res.send({})
})

module.exports = router

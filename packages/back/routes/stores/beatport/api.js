const { search } = require('./logic')
const logger = require('fomoplayer_shared').logger(__filename)
const router = require('express-promise-router')()

router.get('/search', ({ query: { q } }, res) => {
  logger.info(`Beatport search requested`, { query: q })
  return search(q)
    .then((results) => {
      logger.info(`Beatport search succeeded`, { query: q, resultCount: results.length })
      res.send(results)
    })
    .catch((e) => {
      logger.error(`Beatport search failed`, { query: q, error: e.message, stack: e.stack })
      throw e
    })
})

module.exports = router

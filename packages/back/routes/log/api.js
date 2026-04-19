const logger = require('fomoplayer_shared').logger(__filename)

const router = require('express-promise-router')()

const ALLOWED_LEVELS = ['error', 'warn', 'info', 'debug', 'verbose', 'silly']

router.post('/:level', ({ params: { level }, body }, res) => {
  if (!ALLOWED_LEVELS.includes(level)) return res.status(400).end()
  logger[level](`UI:${level}`, body)
  res.status(204).send()
})

module.exports = router

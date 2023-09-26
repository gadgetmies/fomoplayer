const logger = require('../../logger')(__filename)

const router = require('express-promise-router')()

router.post('/:level', ({ params: { level }, body }, res) => {
  logger[level](`UI:${level}`, body)
  res.status(204).send()
})

module.exports = router

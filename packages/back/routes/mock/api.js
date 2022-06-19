const logger = require('../../logger')(__filename)
const router = require('express-promise-router')()
const jobScheduling = require('../../job-scheduling')

router.use('/email/*', ({ headers, body }, res) => {
  logger.debug('Received email sending request', { headers, body })
  res.send({})
})

router.post('/job/:jobId', ({ params: { jobName } }, res) => {
  runJob(jobName).then(result => {
    console.debug(`Finished job ${jobName}`, result)
  })
  res.status(204).send()
})

module.exports = router

const logger = require('../../logger')(__filename)
const router = require('express-promise-router')()
const { runJob } = require('../../job-scheduling')

router.post('/jobs/:name/run', async ({ user: { id: userId }, params: { name } }, res) => {
  if (process.env.NODE_ENV === 'dev' || userId === 2) {
    logger.info(`Starting job: ${name} `)
    res.send(await runJob(name))
  } else {
    res.status(401).send({ error: 'Access denied' })
  }
})

module.exports = router

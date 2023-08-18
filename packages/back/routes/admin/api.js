const logger = require('../../logger')(__filename)
const router = require('express-promise-router')()
const { runJob } = require('../../job-scheduling')
const { mergeTracks } = require('./db')

router.post('/jobs/:name/run', async ({ user: { id: userId }, params: { name } }, res) => {
  if (process.env.NODE_ENV === 'dev' || userId === 2) {
    logger.info(`Starting job: ${name} `)
    res.send(await runJob(name))
  } else {
    res.status(401).send({ error: 'Access denied' })
  }
})

router.get(
  '/merge-tracks/:trackToBeDeleted/to/:trackToKeep',
  async ({ user: { id: userId }, params: { trackToBeDeleted, trackToKeep } }, res) => {
    if (process.env.NODE_ENV === 'dev' || userId === 2) {
      logger.info(`Merging tracks: ${trackToBeDeleted} ${trackToKeep}`)
      await mergeTracks({ trackToBeDeleted, trackToKeep })
      res.send('OK')
    } else {
      res.status(401).send({ error: 'Access denied' })
    }
  }
)

module.exports = router

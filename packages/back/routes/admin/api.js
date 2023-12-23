const logger = require('fomoplayer_shared').logger(__filename)
const router = require('express-promise-router')()
const { runJob } = require('../../job-scheduling')
const { mergeTracks, queryJobLinks, getQueryResults } = require('./db')

const ensureIsAdmin = ({ user: { id: userId } }, res, next) => {
  if (process.env.NODE_ENV === 'dev' || userId === 2) {
    next()
  } else {
    res.status(401).send({ error: 'Access denied' })
  }
}

router.use(ensureIsAdmin)
router.get('/jobs', async ({ user: { id: userId } }, res) => {
  res.send(await queryJobLinks())
})

async function startJobRun(name, res) {
  logger.info(`Starting job: ${name} `)
  await runJob(name)
  res.send('Job started')
}

router.get('/jobs/:name/run', ({ user: { id: userId }, params: { name } }, res) => {
  return startJobRun(name, res)
})

router.post('/jobs/:name/run', ({ user: { id: userId }, params: { name } }, res) => {
  return startJobRun(name, res)
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

router.get('/info', async (_, res) => {
  res.send({ version: process.env.RAILWAY_GIT_COMMIT_SHA })
})

router.get('/radiator', async (_, res) => {
  res.send(await getQueryResults())
})

module.exports = router

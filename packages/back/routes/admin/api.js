const logger = require('fomoplayer_shared').logger(__filename)
const router = require('express-promise-router')()
const { runJob } = require('../../job-scheduling')
const {
  mergeTracks,
  queryJobLinks,
  getQueryResults,
  storeConfig,
  getConfigs,
  upsertTrackAnalysis,
  queryNextTracksToAnalyse,
  insertWaveforms,
  queryTracksWithoutWaveform,
  setPreviewMissing,
  updateTrackDetailsForPreviewTracks,
  markPreviewsMissing,
} = require('./db')
const { getPreviewDetails } = require('../stores/bandcamp/logic')

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
  },
)

router.get('/info', async (_, res) => {
  res.send({ version: process.env.RAILWAY_GIT_COMMIT_SHA })
})

router.get('/radiator/config', async (_, res) => {
  res.send(await getConfigs())
})

router.get('/radiator', async (_, res) => {
  res.send(await getQueryResults())
})

router.post('/radiator/config', async ({ body: { name, lens, config } }, res) => {
  const storedConfig = await storeConfig({ name, lens, config })
  res.status(201).send(storedConfig)
})

router.get('/analyse', async ({ query }, res) => {
  const tracks = await queryNextTracksToAnalyse(query)
  const previews = []
  for (const track of tracks) {
    const firstPreview = track.previews[0]
    if (track.previews.length === 1 && !firstPreview.url && firstPreview.store_name === 'Bandcamp')
    {
      try {
        const { url } = await getPreviewDetails(firstPreview.preview_id)
        previews.push({ ...track, previews: [{...firstPreview, preview_url: url }]})
      } catch (e) {
        logger.warn(`Unable to find preview url for track with preview id: ${track.preview_id}`, { track })
        await setPreviewMissing(track.preview_id)
      }
    } else {
      previews.push(track)
    }
  }
  res.send(previews)
})

router.post('/analyse', async ({ body }, res) => {
  const results = []
  for (const { id, embeddings, model } of body.filter(({ missing }) => !missing)) {
    results.push(await upsertTrackAnalysis(id, model, embeddings))
  }
  await markPreviewsMissing(body.filter(({ missing }) => missing).map(({ preview_id }) => preview_id))
  res.send(results)
})

router.get('/preview', async ({ query }, res) => {
  const tracks = await queryTracksWithoutWaveform(query)
  const previews = []
  for (const track of tracks) {
    if (track.preview_url) {
      previews.push(track)
    } else if (track.store_name === 'Bandcamp') {
      try {
        const { url } = await getPreviewDetails(track.preview_id)
        previews.push({ ...track, preview_url: url })
      } catch (e) {
        logger.warn(`Unable to find preview url for track with preview id: ${track.preview_id}`, { track })
        await setPreviewMissing(track.preview_id)
      }
    }
  }
  res.send(previews)
})

router.post('/waveform', async ({ body }, res) => {
  await insertWaveforms(body)
  const tracks = await updateTrackDetailsForPreviewTracks(body)
  return res.status(200).send(tracks)
})

module.exports = router

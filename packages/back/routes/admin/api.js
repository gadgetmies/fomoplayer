const logger = require('fomoplayer_shared').logger(__filename)
const router = require('express-promise-router')()
const { runJob } = require('../../job-scheduling')
const {
  mergeTracks,
  getJobs,
  getJobRuns,
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
  queryNotificationAudioSamplesWithoutEmbedding,
  upsertNotificationAudioSampleEmbedding,
  queryPreviewsWithoutFingerprint,
  upsertPreviewFingerprints,
  queryAudioSamplesWithoutFingerprint,
  upsertAudioSampleFingerprints,
  findExactMatchForSample,
  queryAudioSamplesWithFingerprint,
  persistSampleMatches,
  queryFingerprintDiagnostics,
  getSuspectedDuplicates,
  mergeDuplicate,
  ignoreDuplicate,
  getMislabeledEntities,
  getMislabeledEntityTracks,
  reassignTrack,
  reassignReleaseTracks,
  cleanupMislabeledSource,
  removeArtistUrl,
  ignoreMislabeledEntity,
  flagMislabeledEntity,
  convertArtistToLabel,
  refetchBandcampLabelArtists,
  refetchBandcampArtistTracks,
  getArtistNameMismatches,
  ignoreArtistNameMismatch,
  fixArtistNameMismatch,
  fixBandcampArtistPageByUrl,
  fixArtistBandcampMismatches,
  getArtistSplitCandidates,
  ignoreArtistSplitCandidate,
  getArtistTracks,
  splitArtist,
  addArtistCredit,
  removeArtistCredit,
} = require('./db')
const { getPreviewDetails } = require('../stores/bandcamp/logic')
const { ensureIsAdmin } = require('../shared/auth.js')
const config = require('../../config')
const { isDatabaseResetAllowed } = require('./database-reset-policy')
const { resetDatabase, databaseResetEnvironmentName } = require('./reset-database')

router.use(ensureIsAdmin)

// Lets the admin UI decide whether to surface preview-only tools. The database
// reset is offered only in preview deployments; production never reports it.
router.get('/capabilities', (req, res) => {
  const databaseReset = isDatabaseResetAllowed(config)
  res.send({
    databaseReset,
    environmentName: databaseReset ? databaseResetEnvironmentName() : null,
  })
})

// Destructive: drops all data and rebuilds an empty schema. Hard-gated to
// preview environments regardless of the UI, requires the env name as a typed
// confirmation token, and is the authoritative check (the resetDatabase helper
// re-asserts the same policy).
router.post('/reset-database', async (req, res) => {
  if (!isDatabaseResetAllowed(config)) {
    return res.status(403).send({ error: 'Database reset is not available in this environment' })
  }
  if (req.body?.confirm !== databaseResetEnvironmentName()) {
    return res.status(400).send({ error: 'Confirmation does not match the environment name' })
  }
  // Rebuilding every migration can outlast the global 25s request timeout.
  if (typeof req.clearTimeout === 'function') req.clearTimeout()
  logger.warn(`Admin ${req.user?.id ?? 'unknown'} triggered a database reset`)
  await resetDatabase()
  res.send({ ok: true })
})
router.get('/jobs', async (req, res) => {
  res.send(await getJobs())
})

async function startJobRun(name, res) {
  logger.info(`Starting job: ${name} `)
  await runJob(name)
  res.send('Job started')
}

router.get('/jobs/:name/runs', async ({ params: { name } }, res) => {
  res.send(await getJobRuns(name))
})

router.get('/jobs/:name/run', ({ user: { id: userId }, params: { name } }, res) => {
  return startJobRun(name, res)
})

router.post('/jobs/:name/run', ({ user: { id: userId }, params: { name } }, res) => {
  return startJobRun(name, res)
})

router.get(
  '/merge-tracks/:trackToBeDeleted/to/:trackToKeep',
  async ({ params: { trackToBeDeleted, trackToKeep } }, res) => {
    logger.info(`Merging tracks: ${trackToBeDeleted} ${trackToKeep}`)
    await mergeTracks({ trackToBeDeleted, trackToKeep })
    res.send('OK')
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
    if (track.previews.length === 1 && !firstPreview.url && firstPreview.store_name === 'Bandcamp') {
      try {
        const { url } = await getPreviewDetails(firstPreview.preview_id)
        previews.push({ ...track, previews: [{ ...firstPreview, preview_url: url }] })
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

router.get('/preview', async ({ query: { limit, stores } }, res) => {
  const tracks = await queryTracksWithoutWaveform(limit, stores.split(','))
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

router.get('/notification-audio-samples/without-embedding', async ({ query: { limit } }, res) => {
  const samples = await queryNotificationAudioSamplesWithoutEmbedding(limit ? parseInt(limit, 10) : undefined)
  res.send(samples)
})

router.post('/notification-audio-samples/embeddings', async ({ body }, res) => {
  const results = []
  for (const { id, embeddings, model } of body.filter(({ missing }) => !missing)) {
    results.push(await upsertNotificationAudioSampleEmbedding(id, model, embeddings))
  }
  res.send(results)
})

router.get('/exact-match/previews/without-fingerprint', async ({ query: { limit } }, res) => {
  const previews = await queryPreviewsWithoutFingerprint(limit ? parseInt(limit, 10) : undefined)
  res.send(previews)
})

router.post('/exact-match/previews/fingerprints', async ({ body: { preview_id, fingerprints } }, res) => {
  try {
    await upsertPreviewFingerprints(preview_id, fingerprints)
    res.send({ success: true, preview_id })
  } catch (error) {
    logger.error('Error uploading preview fingerprints', { error: error.message, stack: error.stack })
    res.status(500).send({ error: error.message })
  }
})

router.get('/exact-match/audio-samples/without-fingerprint', async ({ query: { limit } }, res) => {
  const samples = await queryAudioSamplesWithoutFingerprint(limit ? parseInt(limit, 10) : undefined)
  res.send(samples)
})

router.post('/exact-match/audio-samples/fingerprints', async ({ body: { sample_id, fingerprints } }, res) => {
  try {
    await upsertAudioSampleFingerprints(sample_id, fingerprints)
    res.send({ success: true, sample_id })
  } catch (error) {
    logger.error('Error uploading audio sample fingerprints', { error: error.message, stack: error.stack })
    res.status(500).send({ error: error.message })
  }
})

// Factory so the handler can be unit-tested with a stub diagnostics query.
const fingerprintDiagnosticsHandler = (queryFn, log = logger) =>
  async ({ query: { sampleId, previewId, bucketSeconds } }, res) => {
    const sampleIdInt = parseInt(sampleId, 10)
    const previewIdInt = parseInt(previewId, 10)
    if (!Number.isInteger(sampleIdInt) || !Number.isInteger(previewIdInt)) {
      return res.status(400).send({ error: 'sampleId and previewId required as integers' })
    }
    const opts = {}
    if (bucketSeconds !== undefined) {
      const b = parseFloat(bucketSeconds)
      if (!Number.isFinite(b) || b <= 0) {
        return res.status(400).send({ error: 'bucketSeconds must be a positive number' })
      }
      opts.bucketSeconds = b
    }
    try {
      const diagnostics = await queryFn(sampleIdInt, previewIdInt, opts)
      res.send(diagnostics)
    } catch (error) {
      log.error('Error computing fingerprint diagnostics', { error: error.message, stack: error.stack })
      res.status(500).send({ error: error.message })
    }
  }

router.get('/exact-match/diagnostics', fingerprintDiagnosticsHandler(queryFingerprintDiagnostics))

router.get('/exact-match/audio-samples/:sampleId/match', async ({ params: { sampleId }, query: { threshold } }, res) => {
  try {
    const matchThreshold = threshold === undefined ? undefined : parseFloat(threshold)
    const matches = await findExactMatchForSample(parseInt(sampleId, 10), matchThreshold)
    res.send(matches)
  } catch (error) {
    logger.error('Error finding exact match', { error: error.message, stack: error.stack })
    res.status(500).send({ error: error.message })
  }
})

// Score one, many, or all samples with fingerprints, then persist each
// sample's matches into user_notification_audio_sample_match via
// persistSampleMatches (delete-then-insert per sample). Iteration is
// sequential server-side and best-effort: a single sample's failure is
// caught, logged, and recorded in the response so the rest of the pass
// still completes.
const bulkScoreSamplesHandler =
  ({
    findExactMatch = findExactMatchForSample,
    persistMatches = persistSampleMatches,
    listSamples = queryAudioSamplesWithFingerprint,
    cfg = config,
    log = logger,
  } = {}) =>
  async ({ body }, res) => {
    const requestedIds = body?.sample_ids
    if (Array.isArray(requestedIds) && requestedIds.length === 0) {
      return res.status(400).send({ error: 'sample_ids must be omitted or non-empty' })
    }

    const matchThreshold =
      body?.threshold === undefined ? cfg.sampleMatchDefaultThreshold : parseFloat(body.threshold)
    const bucketSeconds = cfg.sampleMatchBucketSeconds ?? 0.05

    let sampleIds
    try {
      if (Array.isArray(requestedIds)) {
        sampleIds = requestedIds.map((id) => parseInt(id, 10))
      } else {
        const samples = await listSamples()
        // queryAudioSamplesWithFingerprint returns id as a string (BIGINT via
        // NATURAL JOIN); normalise to integer so response sample_ids match the
        // spec ("sample_id": <int>) regardless of how the list was resolved.
        sampleIds = samples.map((s) => parseInt(s.id, 10))
      }
    } catch (error) {
      log.error('Error resolving sample list for bulk scoring', {
        error: error.message,
        stack: error.stack,
      })
      return res.status(500).send({ error: error.message })
    }

    const results = []
    let okCount = 0
    let failCount = 0
    for (const sampleId of sampleIds) {
      try {
        const matches = await findExactMatch(sampleId, matchThreshold)
        await persistMatches(sampleId, matches, matchThreshold, bucketSeconds)
        okCount += 1
        results.push({
          sample_id: sampleId,
          status: 'ok',
          match_count: matches.length,
          top_score: matches.length > 0 ? matches[0].match_score : null,
        })
      } catch (error) {
        failCount += 1
        log.error('Error scoring sample in bulk endpoint', {
          sampleId,
          error: error.message,
          stack: error.stack,
        })
        results.push({ sample_id: sampleId, status: 'error', error: error.message })
      }
    }
    res.send({ ok_count: okCount, fail_count: failCount, results })
  }

router.post('/exact-match/audio-samples/matches', bulkScoreSamplesHandler())

router.get('/duplicates/:type', async ({ params: { type } }, res) => {
  res.send(await getSuspectedDuplicates(type))
})

router.post('/duplicates/:type/merge', async ({ params: { type }, body: { keptId, deletedId } }, res) => {
  await mergeDuplicate(type, keptId, deletedId)
  res.send('OK')
})

router.post('/duplicates/:type/ignore', async ({ params: { type }, body: { id1, id2 } }, res) => {
  await ignoreDuplicate(type, id1, id2)
  res.send('OK')
})

router.get('/mislabeled/:type', async ({ params: { type } }, res) => {
  res.send(await getMislabeledEntities(type))
})

router.get('/mislabeled/:type/:id/tracks', async ({ params: { type, id } }, res) => {
  res.send(await getMislabeledEntityTracks(type, id))
})

router.post('/mislabeled/reassign', async ({ body }, res) => {
  await reassignTrack(body)
  res.send({ ok: true })
})

router.post('/mislabeled/reassign-release', async ({ body }, res) => {
  res.send(await reassignReleaseTracks(body))
})

router.post('/mislabeled/:type/:id/cleanup', async ({ params: { type, id } }, res) => {
  res.send(await cleanupMislabeledSource(type, id))
})

router.post('/mislabeled/:type/:id/ignore', async ({ params: { type, id } }, res) => {
  await ignoreMislabeledEntity(type, id)
  res.send({ ok: true })
})

router.post('/mislabeled/:type/:id/flag', async ({ params: { type, id } }, res) => {
  await flagMislabeledEntity(type, id)
  res.send({ ok: true })
})

router.post('/mislabeled/artist/:id/convert-to-label', async ({ params: { id } }, res) => {
  res.send(await convertArtistToLabel(id))
})

router.post('/mislabeled/artist/:id/remove-url', async ({ params: { id } }, res) => {
  res.send(await removeArtistUrl(id))
})

router.post('/labels/:id/refetch-bandcamp-artists', async ({ params: { id } }, res) => {
  await refetchBandcampLabelArtists(id)
  res.send({ ok: true })
})

router.post('/artists/:id/refetch-bandcamp-tracks', async ({ params: { id } }, res) => {
  await refetchBandcampArtistTracks(id)
  res.send({ ok: true })
})

router.get('/bandcamp/artist-name-mismatches', async (req, res) => {
  res.send(await getArtistNameMismatches())
})

router.post('/bandcamp/artist-name-mismatches/:storeArtistId/fix', async ({ params: { storeArtistId } }, res) => {
  res.send(await fixArtistNameMismatch(storeArtistId))
})

router.post('/bandcamp/artist-name-mismatches/:storeArtistId/ignore', async ({ params: { storeArtistId } }, res) => {
  await ignoreArtistNameMismatch(storeArtistId)
  res.send({ ok: true })
})

router.post('/bandcamp/fix-artist-page', async ({ body: { url } }, res) => {
  res.send(await fixBandcampArtistPageByUrl(url))
})

router.post('/artists/:id/fix-bandcamp-mismatches', async ({ params: { id } }, res) => {
  res.send(await fixArtistBandcampMismatches(id))
})

router.get('/artist-split-candidates', async (_, res) => {
  res.send(await getArtistSplitCandidates())
})

router.get('/artists/:id/tracks', async ({ params: { id } }, res) => {
  res.send(await getArtistTracks(id))
})

router.post('/artist-split-candidates/:id/ignore', async ({ params: { id } }, res) => {
  await ignoreArtistSplitCandidate(id)
  res.send({ ok: true })
})

router.post('/artists/:id/split', async ({ params: { id }, body: { targets } }, res) => {
  res.send(await splitArtist(id, targets))
})

router.post('/tracks/:trackId/credits/add', async ({ params: { trackId }, body: { artistId, name, role } }, res) => {
  res.send(await addArtistCredit(trackId, { artistId, name }, role))
})

router.post('/tracks/:trackId/credits/remove', async ({ params: { trackId }, body: { artistId, role } }, res) => {
  res.send(await removeArtistCredit(trackId, artistId, role))
})

module.exports = router
module.exports.fingerprintDiagnosticsHandler = fingerprintDiagnosticsHandler
module.exports.bulkScoreSamplesHandler = bulkScoreSamplesHandler

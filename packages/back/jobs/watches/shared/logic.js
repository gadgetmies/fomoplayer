const { updatePlaylistTracks, updateLabelTracks, updateArtistTracks } = require('../../../routes/shared/tracks')
const {
  getArtistFollowDetails,
  getLabelFollowDetails,
  getPlaylistFollowDetails,
  insertSource,
  updateSourceDetails,
} = require('./db')
const { setArtistFetchFailed, setLabelFetchFailed, setPlaylistFetchFailed } = require('../../../routes/shared/db/watch')
const logger = require('fomoplayer_shared').logger(__filename)

const isRateLimitError = (error) => {
  return Array.isArray(error) && error[1] && (error[1].isRateLimit === true || error[1].requestCount !== undefined)
}

// After this many entities fail in a row, the failure is more likely the
// store or the network than the entities, so the rest of the batch would fail
// too; the run stops and the next scheduled run tries again.
const CONSECUTIVE_FAILURE_LIMIT = 3

const defaultDeps = { insertSource, updateSourceDetails }

// Runs one store's batch of followed entities (artists, labels or playlists).
//
// - A rate limit stops the run: every further request would be rejected too.
//   The store logs it once when it starts; this adds one line saying where the
//   run stopped and returns it as `rateLimited` rather than as an error.
// - Any other failure belongs to that entity: it is recorded, the entity's
//   next attempt is postponed (recordFailure), and the run continues.
// - CONSECUTIVE_FAILURE_LIMIT failures in a row stop the run.
const runEntityFetches = async (
  { kind, storeUrl, jobDetails, entities, describe, update, recordFailure, recordMetrics },
  deps = defaultDeps,
) => {
  const errors = []
  let rateLimited = null
  let stoppedAfterFailures = false
  let consecutiveFailures = 0
  let processed = 0

  for (const details of entities) {
    processed++
    let sourceId
    let entityErrors = []
    try {
      sourceId = await deps.insertSource({
        operation: `${storeUrl}, fetch${kind.plural[0].toUpperCase()}${kind.plural.slice(1)}`,
        jobDetails,
        followDetails: entities,
      })
      logger.info(`Fetching tracks for ${kind.plural} ${processed}/${entities.length}: ${describe(details)}`)

      const metrics = {}
      entityErrors = await update(storeUrl, details, sourceId, metrics)
      const rateLimitError = entityErrors.find(isRateLimitError)
      if (rateLimitError) {
        rateLimited = rateLimitError[1]
        entityErrors = entityErrors.filter((error) => !isRateLimitError(error))
      }
      await deps.updateSourceDetails(sourceId, {
        ...(recordMetrics ? { skipped: metrics.skipped || 0, totalReleases: metrics.totalReleases || 0 } : {}),
        rateLimited: Boolean(rateLimited),
        ...(rateLimited?.requestCount ? { requestCount: rateLimited.requestCount } : {}),
      })
    } catch (e) {
      if (sourceId) {
        await deps.updateSourceDetails(sourceId, { rateLimited: Boolean(e.isRateLimit) }).catch(() => {})
      }
      if (e.isRateLimit) {
        rateLimited = e
      } else {
        const error = [`Failed to fetch ${kind.singular} ${describe(details)}: ${e.message || e}`, e]
        logger.error(error[0], { stack: e.stack })
        entityErrors = [error]
      }
    }

    if (entityErrors.length > 0) {
      errors.push(...entityErrors)
      consecutiveFailures++
      await recordFailure(details).catch((e) =>
        logger.error(`Could not postpone ${kind.singular} ${describe(details)} after a failed fetch: ${e.message}`),
      )
    } else if (!rateLimited) {
      consecutiveFailures = 0
    }

    if (rateLimited) {
      const retryAfter = rateLimited.retryAfter ? new Date(rateLimited.retryAfter).toISOString() : 'later'
      logger.warn(
        `Stopping ${kind.singular} fetches at ${processed}/${entities.length} for ${storeUrl}: rate limited, retrying after ${retryAfter}`,
      )
      break
    }
    if (consecutiveFailures >= CONSECUTIVE_FAILURE_LIMIT) {
      stoppedAfterFailures = true
      logger.warn(
        `Stopping ${kind.singular} fetches at ${processed}/${entities.length} for ${storeUrl}: ${consecutiveFailures} failed in a row, the store is likely unavailable`,
      )
      break
    }
  }

  if (errors.length > 0) {
    logger.warn(`${kind.singular[0].toUpperCase()}${kind.singular.slice(1)} fetches for ${storeUrl} finished with ${errors.length} error(s)`)
  }

  return {
    errors,
    processed,
    total: entities.length,
    rateLimited: rateLimited
      ? { retryAfter: rateLimited.retryAfter || null, requestCount: rateLimited.requestCount || null }
      : null,
    stoppedAfterFailures,
  }
}

module.exports.playlistFetchJob = (storeUrl, options = {}) => async (jobDetails) =>
  runEntityFetches({
    kind: { singular: 'playlist', plural: 'playlists' },
    storeUrl,
    jobDetails,
    entities: await getPlaylistFollowDetails(storeUrl, options),
    describe: (details) => details.playlistStoreId,
    update: (storeUrl, details, sourceId) => updatePlaylistTracks(storeUrl, details, sourceId),
    recordFailure: (details) => setPlaylistFetchFailed(details.playlistId),
    recordMetrics: false,
  })

module.exports.artistFetchJob = (storeUrl, options = {}) => async (jobDetails) =>
  runEntityFetches({
    kind: { singular: 'artist', plural: 'artists' },
    storeUrl,
    jobDetails,
    entities: await getArtistFollowDetails(storeUrl, options),
    describe: (details) => details.url,
    update: updateArtistTracks,
    recordFailure: (details) => setArtistFetchFailed(details.storeArtistId),
    recordMetrics: true,
  })

module.exports.labelFetchJob = (storeUrl, options = {}) => async (jobDetails) =>
  runEntityFetches({
    kind: { singular: 'label', plural: 'labels' },
    storeUrl,
    jobDetails,
    entities: await getLabelFollowDetails(storeUrl, options),
    describe: (details) => details.url,
    update: updateLabelTracks,
    recordFailure: (details) => setLabelFetchFailed(details.storeLabelId),
    recordMetrics: true,
  })

// Runs a store's artist, label and playlist fetches in turn. A rate limit in
// one stops the rest too, since they hit the same store. A rate-limited run is
// a planned pause, not a failure: the job succeeds with `rateLimited` in its
// result. It fails only when fetches actually failed.
module.exports.fetchJobs = (jobs) => async (jobId) => {
  const errors = []
  const runs = {}
  let rateLimited = null

  for (const [name, fn] of Object.entries(jobs)) {
    if (rateLimited) {
      runs[name] = { skipped: 'rate limited' }
      continue
    }
    const res = await fn({ name, jobId })
    errors.push(...res.errors)
    runs[name] = { processed: res.processed, total: res.total, errors: res.errors.length, stoppedAfterFailures: res.stoppedAfterFailures }
    rateLimited = res.rateLimited
  }

  const skipped = Object.keys(runs).filter((name) => runs[name].skipped)
  if (skipped.length > 0) logger.info(`Skipped ${skipped.join(', ')} fetches: rate limited`)

  const result = { runs, ...(rateLimited ? { rateLimited } : {}), ...(errors.length ? { errors } : {}) }
  return { success: errors.length === 0, result }
}

module.exports.runEntityFetches = runEntityFetches
module.exports.CONSECUTIVE_FAILURE_LIMIT = CONSECUTIVE_FAILURE_LIMIT

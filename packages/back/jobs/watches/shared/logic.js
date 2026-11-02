const { updatePlaylistTracks, updateLabelTracks, updateArtistTracks } = require('../../../routes/shared/tracks')
const {
  getArtistFollowDetails,
  getLabelFollowDetails,
  getPlaylistFollowDetails,
  insertSource,
  updateSourceDetails,
} = require('./db')
const logger = require('fomoplayer_shared').logger(__filename)

const isRateLimitError = (error) => {
  return Array.isArray(error) && error[1] && (error[1].isRateLimit === true || error[1].requestCount !== undefined)
}

const extractRequestCount = (error) => {
  if (!error) return 0
  if (Array.isArray(error)) return error[1]?.requestCount || 0
  return error.requestCount || 0
}

// Runs one store's batch of followed entities (artists, labels or playlists):
// a source row per entity, the store-specific update, and the rate-limit stop.
const runEntityFetches = async ({ kind, storeUrl, jobDetails, entities, describe, update, recordMetrics }) => {
  const errors = []

  let count = 1
  for (const details of entities) {
    let sourceId
    try {
      sourceId = await insertSource({
        operation: `${storeUrl}, fetch${kind.plural[0].toUpperCase()}${kind.plural.slice(1)}`,
        jobDetails,
        followDetails: entities,
      })
      logger.info(`Fetching tracks for ${kind.plural} ${count}/${entities.length}: ${describe(details)}`)
      count++

      const metrics = {}
      const trackErrors = await update(storeUrl, details, sourceId, metrics)
      errors.push(...trackErrors)

      const rateLimitError = trackErrors.find(isRateLimitError)
      const rateLimited = Boolean(rateLimitError)
      const rateLimitRequestCount = extractRequestCount(rateLimitError)
      await updateSourceDetails(sourceId, {
        ...(recordMetrics ? { skipped: metrics.skipped || 0, totalReleases: metrics.totalReleases || 0 } : {}),
        rateLimited,
        ...(rateLimitRequestCount ? { requestCount: rateLimitRequestCount } : {}),
      })
      if (rateLimited) {
        logger.error(
          `Rate limit reached after ${rateLimitRequestCount || 'unknown'} requests during ${kind.singular} fetch job, stopping at ${kind.singular} ${count - 1}/${entities.length}`,
        )
        break
      }
    } catch (e) {
      if (sourceId) {
        await updateSourceDetails(sourceId, { rateLimited: Boolean(e.isRateLimit) }).catch(() => {})
      }
      if (e.isRateLimit) {
        const requestCount = e.requestCount || 'unknown'
        logger.error(
          `Rate limit reached after ${requestCount} requests during ${kind.singular} fetch job, stopping at ${kind.singular} ${count - 1}/${entities.length}`,
        )
        errors.push([`Rate limit reached after ${requestCount} requests`, e])
        break
      }
      const error = [`Failed to fetch ${kind.singular} details for ${describe(details)}`, e, jobDetails]
      logger.error(...error)
      errors.push(error)
    }
  }

  if (errors.length > 0) {
    logger.error(`${kind.singular[0].toUpperCase()}${kind.singular.slice(1)} fetch job completed with ${errors.length} error(s)`)
  }

  return errors
}

module.exports.playlistFetchJob = (storeUrl, options = {}) => async (jobDetails) =>
  runEntityFetches({
    kind: { singular: 'playlist', plural: 'playlists' },
    storeUrl,
    jobDetails,
    entities: await getPlaylistFollowDetails(storeUrl, options),
    describe: (details) => details.playlistStoreId,
    update: (storeUrl, details, sourceId) => updatePlaylistTracks(storeUrl, details, sourceId),
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
    recordMetrics: true,
  })

module.exports.fetchJobs = (jobs) => async (jobId) => {
  let errors = []

  for (const [name, fn] of Object.entries(jobs)) {
    const res = await fn({ name, jobId })
    errors = errors.concat(res)
  }

  if (errors.length > 0) {
    return { success: false, result: errors }
  }

  return { success: true }
}

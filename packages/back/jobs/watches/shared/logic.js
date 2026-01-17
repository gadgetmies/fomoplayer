const { updatePlaylistTracks, updateLabelTracks, updateArtistTracks } = require('../../../routes/shared/tracks')
const { getArtistFollowDetails, getLabelFollowDetails, getPlaylistFollowDetails, insertSource } = require('./db')
const logger = require('fomoplayer_shared').logger(__filename)

const isRateLimitError = (error) => {
  return Array.isArray(error) && error[1] && (error[1].isRateLimit === true || error[1].requestCount !== undefined)
}

module.exports.playlistFetchJob = (storeUrl) => async (jobDetails) => {
  const errors = []
  const playlistFollowDetails = await getPlaylistFollowDetails(storeUrl)

  let count = 1
  for (const details of playlistFollowDetails) {
    try {
      const sourceId = await insertSource({
        operation: `${storeUrl}, fetchPlaylists`,
        jobDetails,
        followDetails: playlistFollowDetails,
      })
      logger.info(`Fetching tracks for playlist ${count}/${playlistFollowDetails.length}: ${details.playlistStoreId}`)
      count++
      const trackErrors = await updatePlaylistTracks(storeUrl, details, sourceId)
      errors.push(...trackErrors)
      
      const rateLimitError = trackErrors.find(isRateLimitError)
      if (rateLimitError) {
        const requestCount = rateLimitError[1]?.requestCount || 'unknown'
        logger.error(`Rate limit reached after ${requestCount} requests during playlist fetch job, stopping at playlist ${count - 1}/${playlistFollowDetails.length}`)
        break
      }
    } catch (e) {
      if (e.isRateLimit) {
        const requestCount = e.requestCount || 'unknown'
        logger.error(`Rate limit reached after ${requestCount} requests during playlist fetch job, stopping at playlist ${count - 1}/${playlistFollowDetails.length}`)
        errors.push([`Rate limit reached after ${requestCount} requests`, e])
        break
      }
      const error = [`Failed to fetch playlist details for playlistId: ${details.playlistId}`, e, jobDetails]
      logger.error(...error)
      errors.push(error)
    }
  }

  if (errors.length > 0) {
    logger.error(`Playlist fetch job completed with ${errors.length} error(s)`)
  }

  return errors
}

module.exports.artistFetchJob = (storeUrl) => async (jobDetails) => {
  const errors = []
  const artistFollowDetails = await getArtistFollowDetails(storeUrl)

  let count = 1
  for (const details of artistFollowDetails) {
    try {
      const sourceId = await insertSource({
        operation: `${storeUrl}, fetchArtists`,
        jobDetails,
        followDetails: artistFollowDetails,
      })
      logger.info(
        `Updating tracks for artists ${count}/${artistFollowDetails.length}: ${details.storeArtistId} @ ${storeUrl}`,
      )
      count++

      const trackErrors = await updateArtistTracks(storeUrl, details, sourceId)
      errors.push(...trackErrors)
      
      const rateLimitError = trackErrors.find(isRateLimitError)
      if (rateLimitError) {
        const requestCount = rateLimitError[1]?.requestCount || 'unknown'
        logger.error(`Rate limit reached after ${requestCount} requests during artist fetch job, stopping at artist ${count - 1}/${artistFollowDetails.length}`)
        break
      }
    } catch (e) {
      if (e.isRateLimit) {
        const requestCount = e.requestCount || 'unknown'
        logger.error(`Rate limit reached after ${requestCount} requests during artist fetch job, stopping at artist ${count - 1}/${artistFollowDetails.length}`)
        errors.push([`Rate limit reached after ${requestCount} requests`, e])
        break
      }
      const errorMessage = `Failed to fetch artist details for ${details.url}, ${JSON.stringify(e)}`
      logger.error(errorMessage, e)
      errors.push([errorMessage, e])
    }
  }

  if (errors.length > 0) {
    logger.error(`Artist fetch job completed with ${errors.length} error(s)`)
  }

  return errors
}

module.exports.labelFetchJob = (storeUrl) => async (jobDetails) => {
  const errors = []
  const labelFollowDetails = await getLabelFollowDetails(storeUrl)

  let count = 1
  for (const details of labelFollowDetails) {
    try {
      const sourceId = await insertSource({
        operation: `${storeUrl}, fetchLabels`,
        jobDetails,
        followDetails: labelFollowDetails,
      })
      logger.info(`Fetching tracks for labels ${count}/${labelFollowDetails.length}: ${details.labelStoreId}`)
      count++

      const trackErrors = await updateLabelTracks(storeUrl, details, sourceId)
      errors.push(...trackErrors)
      
      const rateLimitError = trackErrors.find(isRateLimitError)
      if (rateLimitError) {
        const requestCount = rateLimitError[1]?.requestCount || 'unknown'
        logger.error(`Rate limit reached after ${requestCount} requests during label fetch job, stopping at label ${count - 1}/${labelFollowDetails.length}`)
        break
      }
    } catch (e) {
      if (e.isRateLimit) {
        const requestCount = e.requestCount || 'unknown'
        logger.error(`Rate limit reached after ${requestCount} requests during label fetch job, stopping at label ${count - 1}/${labelFollowDetails.length}`)
        errors.push([`Rate limit reached after ${requestCount} requests`, e])
        break
      }
      const error = [`Failed to fetch label details for ${details.url}`, e]
      logger.error(...error)
      errors.push(error)
    }
  }

  if (errors.length > 0) {
    logger.error(`Label fetch job completed with ${errors.length} error(s)`)
  }

  return errors
}

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

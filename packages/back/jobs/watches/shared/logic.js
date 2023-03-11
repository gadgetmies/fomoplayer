const { updatePlaylistTracks, updateLabelTracks, updateArtistTracks } = require('../../../routes/shared/tracks')
const { getArtistFollowDetails, getLabelFollowDetails, getPlaylistFollowDetails, insertSource } = require('./db')
const logger = require('../../../logger')(__filename)

module.exports.playlistFetchJob = storeUrl => async jobDetails => {
  const sourceId = await insertSource({ operation: `${storeUrl}, fetchPlaylists`, jobDetails })
  const errors = []
  const playlistFollowDetails = await getPlaylistFollowDetails(storeUrl)

  let count = 1
  for (const details of playlistFollowDetails) {
    try {
      logger.info(`Fetching tracks for playlist ${count}/${playlistFollowDetails.length}: ${details.playlistStoreId}`)
      count++
      await updatePlaylistTracks(storeUrl, details, sourceId)
    } catch (e) {
      const error = [`Failed to fetch playlist details for playlistId: ${details.playlistId}`, e, jobDetails]
      logger.error(...error)
      errors.concat(error)
    }
  }

  return errors
}

module.exports.artistFetchJob = storeUrl => async jobDetails => {
  const sourceId = await insertSource({ operation: `${storeUrl}, fetchArtists`, jobDetails })
  const errors = []
  const artistFollowDetails = await getArtistFollowDetails(storeUrl)

  let count = 1
  for (const details of artistFollowDetails) {
    try {
      logger.info(`Updating tracks for artists ${count}/${artistFollowDetails.length}: ${details.storeArtistId}`)
      count++

      errors.concat(await updateArtistTracks(storeUrl, details, sourceId))
    } catch (e) {
      const errorMessage = `Failed to fetch artist details for ${details.url}`
      logger.error(errorMessage)
      logger.silly(e)
      errors.push([errorMessage, e])
    }
  }

  return errors
}

module.exports.labelFetchJob = storeUrl => async jobDetails => {
  const sourceId = await insertSource({ operation: `${storeUrl}, fetchLabels`, jobDetails })
  const errors = []
  const labelFollowDetails = await getLabelFollowDetails(storeUrl)

  let count = 1
  for (const details of labelFollowDetails) {
    try {
      logger.info(`Fetching tracks for labels ${count}/${labelFollowDetails.length}: ${details.labelStoreId}`)
      count++

      await updateLabelTracks(storeUrl, details, sourceId)
    } catch (e) {
      const error = [`Failed to fetch label details for ${details.url}`, e]
      logger.error(...error)
      errors.push(error)
    }
  }

  return errors
}

module.exports.fetchJobs = jobs => async jobId => {
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

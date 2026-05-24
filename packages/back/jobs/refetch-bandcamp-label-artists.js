const logger = require('fomoplayer_shared').logger(__filename)
const { fetchLabelReleaseTracks } = require('../routes/stores/bandcamp/logic.js')
const {
  getPendingLabelArtistRefetches,
  queryLabelBandcampReleaseUrls,
  markLabelArtistRefetchStarted,
  setLabelArtistRefetchProgress,
  markLabelArtistRefetchDone,
  markLabelArtistRefetchError,
  reattributeTracksArtists,
} = require('../routes/stores/bandcamp/db.js')

// Drain the label artist re-fetch queue: for each queued label, re-fetch its
// Bandcamp releases as label pages and re-attribute every track to its real
// artists. Processing is resumable per release so a Bandcamp rate limit just
// pauses the work until the next scheduled run.
module.exports = async () => {
  const pending = await getPendingLabelArtistRefetches()
  let labelsCompleted = 0
  let tracksUpdated = 0

  for (const { id, labelId, labelName, releasesDone } of pending) {
    let urls
    try {
      urls = await queryLabelBandcampReleaseUrls(labelId)
    } catch (e) {
      await markLabelArtistRefetchError(id, e.message)
      logger.error(`Failed to list Bandcamp releases for label ${labelId}`, e)
      continue
    }

    await markLabelArtistRefetchStarted(id, urls.length)

    let done = releasesDone || 0
    try {
      for (let i = done; i < urls.length; i++) {
        try {
          const tracks = await fetchLabelReleaseTracks(urls[i], labelName)
          tracksUpdated += await reattributeTracksArtists(tracks, labelId)
        } catch (e) {
          if (e.isRateLimit) throw e
          logger.warn(`Skipping release ${urls[i]} for label ${labelId}: ${e.message}`)
        }
        done = i + 1
        await setLabelArtistRefetchProgress(id, done)
      }
      await markLabelArtistRefetchDone(id)
      labelsCompleted++
    } catch (e) {
      if (e.isRateLimit) {
        logger.warn(
          `Rate limited while re-fetching label ${labelId}; will resume next run (${done}/${urls.length} releases done)`,
        )
        return { success: true, result: { labelsCompleted, tracksUpdated, note: 'rate limited, will resume' } }
      }
      await markLabelArtistRefetchError(id, e.message)
      logger.error(`Failed to re-attribute artists for label ${labelId}`, e)
    }
  }

  return { success: true, result: { labelsCompleted, tracksUpdated } }
}

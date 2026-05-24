const logger = require('fomoplayer_shared').logger(__filename)
const { fetchLabelReleaseTracks, fetchArtistReleaseTracks } = require('../routes/stores/bandcamp/logic.js')
const {
  getPendingRefetches,
  queryLabelBandcampReleaseUrls,
  queryArtistBandcampReleaseUrls,
  markLabelArtistRefetchStarted,
  setLabelArtistRefetchProgress,
  markLabelArtistRefetchDone,
  markLabelArtistRefetchError,
  reattributeTracksArtists,
} = require('../routes/stores/bandcamp/db.js')

// Drain the Bandcamp re-attribution queue. For each queued entity, re-fetch its
// Bandcamp releases (labels as label pages, artists as artist pages) and
// re-attribute every track to its real artists. Processing is resumable per
// release so a Bandcamp rate limit just pauses the work until the next run.
module.exports = async () => {
  const pending = await getPendingRefetches()
  let entitiesCompleted = 0
  let tracksUpdated = 0

  for (const { id, labelId, artistId, name, type, releasesDone } of pending) {
    const isLabel = type === 'label'

    let urls
    try {
      urls = isLabel ? await queryLabelBandcampReleaseUrls(labelId) : await queryArtistBandcampReleaseUrls(artistId)
    } catch (e) {
      await markLabelArtistRefetchError(id, e.message)
      logger.error(`Failed to list Bandcamp releases for ${type} ${labelId || artistId}`, e)
      continue
    }

    await markLabelArtistRefetchStarted(id, urls.length)

    let done = releasesDone || 0
    try {
      for (let i = done; i < urls.length; i++) {
        try {
          const tracks = isLabel
            ? await fetchLabelReleaseTracks(urls[i], name)
            : await fetchArtistReleaseTracks(urls[i], name)
          tracksUpdated += await reattributeTracksArtists(tracks, isLabel ? labelId : null)
        } catch (e) {
          if (e.isRateLimit) throw e
          logger.warn(`Skipping release ${urls[i]} for ${type} ${labelId || artistId}: ${e.message}`)
        }
        done = i + 1
        await setLabelArtistRefetchProgress(id, done)
      }
      await markLabelArtistRefetchDone(id)
      entitiesCompleted++
    } catch (e) {
      if (e.isRateLimit) {
        logger.warn(
          `Rate limited while re-fetching ${type} ${labelId || artistId}; will resume next run (${done}/${urls.length} releases done)`,
        )
        return { success: true, result: { entitiesCompleted, tracksUpdated, note: 'rate limited, will resume' } }
      }
      await markLabelArtistRefetchError(id, e.message)
      logger.error(`Failed to re-attribute artists for ${type} ${labelId || artistId}`, e)
    }
  }

  return { success: true, result: { entitiesCompleted, tracksUpdated } }
}

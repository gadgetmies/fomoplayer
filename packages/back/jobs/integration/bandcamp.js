const { getPageReleaseTracks, getPlaylistTracks } = require('../../routes/stores/bandcamp/logic')
const logger = require('fomoplayer_shared').logger(__filename)

// Must be present AND non-null on every fetched track.
const requiredTrackProperties = [
  'id',
  'title',
  'artists',
  'released',
  'published',
  'duration_ms',
  'release',
  'previews',
  'store_details',
]

// Must be present as keys (the transform always emits them) but may legitimately
// be null on Bandcamp: `version` is null for tracks without a remix/version, and
// `label` is null on artist pages (the subdomain is the artist, not a label).
const nullableTrackProperties = ['version', 'label']

// Errors are stored in job_run_result as JSON, where an Error serialises to {}.
const describeError = (e) => (Array.isArray(e) ? e.map(describeError).join(': ') : (e?.toString?.() ?? String(e)))

const missingProperties = (track) =>
  requiredTrackProperties
    .filter((prop) => !track.hasOwnProperty(prop) || track[prop] === null)
    .concat(nullableTrackProperties.filter((prop) => !track.hasOwnProperty(prop)))

// The followed-entity watch generators (getArtistTracks / getLabelTracks) only
// fetch releases that are not yet in the database, and production already has
// every release of these pages, so they would yield no tracks at all. Exercise
// the same scraping directly instead: list the page's releases and fetch the
// newest one with the page context the watch job would use.
const fetchFromPage = (entityType) => async (url) => getPageReleaseTracks(url, entityType)

// The tag playlist has no known-release filter. Stop at the first release that
// yields tracks rather than scraping the whole discover listing.
const fetchFromPlaylist = async (url) => {
  const errors = []
  for await (const { tracks, errors: releaseErrors } of getPlaylistTracks({ playlistStoreId: url, type: 'tag' })) {
    errors.push(...(releaseErrors || []))
    if (tracks && tracks.length > 0) {
      return { tracks, errors }
    }
  }
  return { tracks: [], errors }
}

const checks = [
  { url: 'https://noisia.bandcamp.com', fetch: fetchFromPage('artist') },
  { url: 'https://visionrecordings.bandcamp.com', fetch: fetchFromPage('label') },
  { url: 'https://bandcamp.com/discover/electronic?tags=drum-bass', fetch: fetchFromPlaylist },
]

module.exports = async () => {
  const combinedErrors = []
  for (const { url, fetch } of checks) {
    let result
    try {
      result = await fetch(url)
    } catch (e) {
      const error = `Fetching tracks for (${url}) failed: ${describeError(e)}`
      logger.error(error)
      combinedErrors.push(error)
      continue
    }

    // A single release can fail on its own (deleted, region-locked, prerelease),
    // so surface per-release errors for visibility but only fail the smoke test
    // when no tracks come back at all or a track is structurally broken.
    if (result.errors.length > 0) {
      logger.warn(`Per-release errors while fetching tracks for (${url}): ${result.errors.map(describeError)}`)
    }

    if (result.tracks.length === 0) {
      const error = `No tracks fetched for (${url})${
        result.errors.length > 0 ? `: ${result.errors.map(describeError).join('; ')}` : ''
      }`
      logger.error(error)
      combinedErrors.push(error)
      continue
    }

    const missing = missingProperties(result.tracks[0])
    if (missing.length !== 0) {
      const error = `Missing properties in fetched tracks for (${url}): ${missing.join(', ')}`
      logger.error(error)
      combinedErrors.push(error)
    }
  }

  if (combinedErrors.length !== 0) {
    return { result: combinedErrors, success: false }
  }

  return { success: true }
}

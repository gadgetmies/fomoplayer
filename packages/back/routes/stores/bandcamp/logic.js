const R = require('ramda')
const BPromise = require('bluebird')
const { bandcampReleasesTransform } = require('fomoplayer_chrome_extension/src/js/transforms/bandcamp')
const { queryPreviewDetails } = require('../../shared/db/preview.js')
const { queryStoreId } = require('../../shared/db/store.js')
const {
  getReleaseAsync,
  getArtistAsync,
  getLabelAsync,
  getPageDetailsAsync,
  getTagReleasesAsync,
  getSearchResultsAsync,
  static: { getTagsFromUrl, getTagName, isRateLimited },
} = require('./bandcamp-api.js')

const { queryAlbumUrl } = require('./db.js')
const logger = require('fomoplayer_shared').logger(__filename)

let storeDbId = null
const storeName = (module.exports.storeName = 'Bandcamp')
module.exports.storeUrl = 'https://bandcamp.com'

const getStoreDbId = () => {
  if (storeDbId) {
    return BPromise.resolve(storeDbId)
  } else {
    return queryStoreId(storeName).then((store_id) => {
      storeDbId = store_id
      return storeDbId
    })
  }
}

module.exports.getPreviewDetails = async (previewId) => {
  const storeId = await getStoreDbId()
  const details = await queryPreviewDetails(previewId)
  for (const detail of details) {
    const storeTrackId = detail.store_track_id
    const albumUrl = await queryAlbumUrl(storeId, storeTrackId)
    const albumInfo = await getReleaseAsync(albumUrl)
    logger.debug('albuminfo trackinfo', albumInfo.trackinfo)
    logger.debug('details', details)
    const url = await albumInfo.trackinfo.find(R.propEq('track_id', parseInt(storeTrackId, 10)))?.file['mp3-128']
    if (url) {
      return {
        ...details,
        url: url,
      }
    }
  }
  logger.error('Preview url not found for id', { details, previewId })
  throw new Error('Preview url not found for id')
}

const getArtistDetails = (module.exports.getArtistDetails = async (url) => ({ url, ...(await getArtistAsync(url)) }))

module.exports.getArtistName = async (url) => {
  const { name } = await getArtistDetails(url)
  return name
}

module.exports.getLabelName = async ({ url }) => {
  const { name } = await getLabelAsync(url)
  return name
}

const getPlaylistName = (module.exports.getPlaylistName = ({ url, type }) => {
  if (type === 'tag') {
    return getTagName(getTagsFromUrl(url))
  }
})

module.exports.getFollowDetails = async ({ id, type, url }) => {
  let details
  if (['artist', 'label'].includes(type)) {
    const { name, type: pageType } = await getPageDetailsAsync(url)
    details = { id, name, type: pageType, url }
  } else if (type === 'tag') {
    const name = await getPlaylistName({ url, type })
    details = { id: url, name, type: 'playlist', url }
  } else {
    throw new Error('Regex type not handled in code!')
  }

  return [{ ...details, store: { name: storeName.toLowerCase() } }]
}

const releaseTracksWithFiles = (releaseDetails) => {
  const tracks = releaseDetails.reduce((acc, { trackinfo }) => acc.concat(trackinfo), [])
  return tracks.filter(R.complement(R.propEq('file', null)))
}

const getTracksFromReleases = async (releaseUrls) => {
  const errors = []

  let releaseDetails = []
  for (const releaseUrl of releaseUrls) {
    logger.debug(`Processing release: ${releaseUrl}`)
    try {
      const releaseInfo = await getReleaseAsync(releaseUrl)
      releaseDetails.push(releaseInfo)
    } catch (e) {
      if (e.isRateLimit) {
        logger.error('Rate limit reached while fetching release details', { releaseUrl, error: e.message })
        throw e
      }
      const error = [`Failed to fetch release details from ${releaseUrl}`, e]
      logger.error(...error)
      errors.push(error)
    }
  }

  let transformed = []
  try {
    transformed = bandcampReleasesTransform(releaseDetails)
    logger.debug(`Found ${transformed.length} tracks for ${releaseUrls.length} releases`)
  } catch (e) {
    logger.error(`Track transformation error`, { releaseUrls, releaseDetails })
    logger.error(e)
    return { errors, tracks: [] }
  }

  const tracksWithFiles = releaseTracksWithFiles(releaseDetails)
  if (
    transformed.length === 0 &&
    releaseDetails.length > 0 &&
    releaseDetails.filter(R.complement(R.prop('is_prerelease'))) > 0 &&
    tracksWithFiles.length > 0
  ) {
    logger.error(`Track transformation failed`, { releaseUrls, releaseDetails, tracksWithFiles })
    return { errors, tracks: [] }
  } else if (transformed.length === 0) {
    logger.warn(`No tracks found for releases`, { releaseUrls, releaseDetails })
  }

  return { errors, tracks: transformed }
}

module.exports.getArtistTracks = async function* ({ url }) {
  try {
    const { releaseUrls } = await getArtistAsync(url)
    logger.debug(`Found ${releaseUrls.length} releases for artist ${url}`)
    logger.debug('Processing releases', releaseUrls)
    // TODO: figure out how to get rid of the duplication
    for (const releaseUrl of releaseUrls) {
      if (isRateLimited()) {
        logger.error('Rate limit reached, stopping iteration for artist tracks')
        return
      }
      try {
        yield await getTracksFromReleases([releaseUrl])
      } catch (e) {
        if (e.isRateLimit) {
          logger.error('Rate limit reached while getting artist tracks from release', e)
          return
        }
        logger.error('Error getting artist tracks from release', e)
        yield { tracks: [], errors: [e] }
      }
    }
  } catch (e) {
    if (e.isRateLimit) {
      logger.error('Rate limit reached while getting artist details', e)
      return
    }
    throw e
  }
}

module.exports.getLabelTracks = async function* ({ url }) {
  try {
    const { releaseUrls } = await getLabelAsync(url)
    logger.debug(`Found ${releaseUrls.length} releases for label ${url}`)
    logger.debug('Processing releases', releaseUrls)
    for (const releaseUrl of releaseUrls) {
      if (isRateLimited()) {
        logger.error('Rate limit reached, stopping iteration for label tracks')
        return
      }
      try {
        yield await getTracksFromReleases([releaseUrl])
      } catch (e) {
        if (e.isRateLimit) {
          logger.error('Rate limit reached while getting label tracks from release', e)
          return
        }
        logger.error('Error getting label tracks from release', e)
        yield { tracks: [], errors: [e] }
      }
    }
  } catch (e) {
    if (e.isRateLimit) {
      logger.error('Rate limit reached while getting label details', e)
      return
    }
    throw e
  }
}

module.exports.getPlaylistTracks = async function* ({ playlistStoreId, type }) {
  if (type === 'tag') {
    try {
      const { releaseUrls } = await getTagReleasesAsync(getTagsFromUrl(playlistStoreId))
      const uniqueReleaseUrls = R.uniq(releaseUrls)
      logger.debug(`Found ${uniqueReleaseUrls.length} releases for tag ${playlistStoreId}`)
      for (const releaseUrl of uniqueReleaseUrls) {
        if (isRateLimited()) {
          logger.error('Rate limit reached, stopping iteration for playlist tracks')
          return
        }
        try {
          yield await getTracksFromReleases([releaseUrl])
        } catch (e) {
          if (e.isRateLimit) {
            logger.error('Rate limit reached while getting playlist tracks from release', e)
            return
          }
          yield { tracks: [], errors: [e] }
        }
      }
    } catch (e) {
      if (e.isRateLimit) {
        logger.error('Rate limit reached while getting tag releases', e)
        return
      }
      throw e
    }
  } else {
    throw new Error(`Unsupported playlist type: '${type}' (supported: 'tag') ${type === 'tag'}`)
  }
}

module.exports.search = async (query) => {
  return (await getSearchResultsAsync(query)).map((item) => ({ ...item, store: { name: storeName.toLowerCase() } }))
}

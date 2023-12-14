const R = require('ramda')
const BPromise = require('bluebird')
const { bandcampReleasesTransform } = require('multi_store_player_chrome_extension/src/js/transforms/bandcamp')
const { queryPreviewDetails } = require('../../shared/db/preview.js')
const { queryStoreId } = require('../../shared/db/store.js')
const {
  getReleaseAsync,
  getTagAsync,
  getArtistAsync,
  getLabelAsync,
  getPageDetailsAsync,
  getTagReleasesAsync,
  getSearchResultsAsync
} = require('./bandcamp-api.js')

const { queryAlbumUrl } = require('./db.js')
const { getFollowDetailsFromUrl } = require('../logic')
const logger = require('../../../logger')(__filename)

let storeDbId = null
const storeName = (module.exports.storeName = 'Bandcamp')
module.exports.storeUrl = 'https://bandcamp.com'

const getStoreDbId = () => {
  if (storeDbId) {
    return BPromise.resolve(storeDbId)
  } else {
    return queryStoreId(storeName).then(store_id => {
      storeDbId = store_id
      return storeDbId
    })
  }
}

module.exports.getPreviewDetails = async previewId => {
  const storeId = await getStoreDbId()
  const details = await queryPreviewDetails(previewId)
  const storeTrackId = details.store_track_id
  const albumUrl = await queryAlbumUrl(storeId, storeTrackId)
  const albumInfo = await getReleaseAsync(albumUrl)
  const url = await albumInfo.trackinfo.find(R.propEq('track_id', parseInt(storeTrackId, 10))).file['mp3-128']
  return {
    ...details,
    url: url
  }
}

const getTagFromUrl = function(playlistUrl) {
  const match = playlistUrl.match(/^https:\/\/bandcamp.com\/tag\/([^/?]+)/)
  return match[1]
}

module.exports.getArtistName = async url => {
  const { name } = await getArtistAsync(url)
  return name
}

module.exports.getLabelName = async url => {
  const { name } = await getLabelAsync(url)
  return name
}

module.exports.getPlaylistId = getTagFromUrl

const getPlaylistName = (module.exports.getPlaylistName = async (type, url) => {
  if (type === 'tag') {
    const res = await getTagAsync(getTagFromUrl(url))
    return res.name
  }
})

module.exports.getFollowDetails = async urlString => {
  const { id, type } = await getFollowDetailsFromUrl(urlString)
  let details
  if (['artist', 'label'].includes(type)) {
    const { name, type: pageType } = await getPageDetailsAsync(urlString)
    details = { id, name, type: pageType, url: urlString }
  } else if (type === 'tag') {
    const label = await getPlaylistName(type, urlString)
    details = { id, name: `Tag: ${label}`, type: 'playlist', url: urlString }
  } else {
    throw new Error('Regex type not handled in code!')
  }

  return [{ ...details, name: storeName.toLowerCase() }]
}

const releaseTracksWithFiles = releaseDetails => {
  const tracks = releaseDetails.reduce((acc, { trackinfo }) => acc.concat(trackinfo), [])
  return tracks.filter(R.complement(R.propEq('file', null)))
}

const getTracksFromReleases = async releaseUrls => {
  const errors = []

  let releaseDetails = []
  for (const releaseUrl of releaseUrls) {
    logger.debug(`Processing release: ${releaseUrl}`)
    try {
      const releaseInfo = await getReleaseAsync(releaseUrl)
      releaseDetails.push(releaseInfo)
    } catch (e) {
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

module.exports.getArtistTracks = async function*({ url }) {
  const { releaseUrls } = await getArtistAsync(url)
  logger.debug(`Found ${releaseUrls.length} releases for artist ${url}`)
  logger.debug('Processing releases', releaseUrls)
  // TODO: figure out how to get rid of the duplication
  for (const releaseUrl of releaseUrls) {
    try {
      yield await getTracksFromReleases([releaseUrl])
    } catch (e) {
      logger.error('Error getting artist tracks from release', e)
      yield { tracks: [], errors: [e] }
    }
  }
}

module.exports.getLabelTracks = async function*({ url }) {
  const { releaseUrls } = await getLabelAsync(url)
  logger.debug(`Found ${releaseUrls.length} releases for label ${url}`)
  logger.debug('Processing releases', releaseUrls)
  for (const releaseUrl of releaseUrls) {
    try {
      yield await getTracksFromReleases([releaseUrl])
    } catch (e) {
      logger.error('Error getting label tracks from release', e)
      yield { tracks: [], errors: [e] }
    }
  }
}

module.exports.getPlaylistTracks = async function*({ playlistStoreId, type }) {
  if (type === 'tag') {
    const releases = await getTagReleasesAsync(playlistStoreId)
    const releaseUrls = R.uniq(R.flatten(releases.map(R.prop('items'))).map(R.prop('tralbum_url'))).filter(R.identity)
    logger.debug(`Found ${releaseUrls.length} releases for tag ${playlistStoreId}`)
    for (const releaseUrl of releaseUrls) {
      try {
        yield await getTracksFromReleases([releaseUrl])
      } catch (e) {
        yield { tracks: [], errors: [e] }
      }
    }
  } else {
    throw new Error(`Unsupported playlist type: '${type}' (supported: 'tag') ${type === 'tag'}`)
  }
}

module.exports.search = async query => {
  return (await getSearchResultsAsync(query)).map(item => ({ ...item, store: { name: storeName.toLowerCase() } }))
}

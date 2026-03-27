const R = require('ramda')
const { junodownloadReleasesTransform } = require('fomoplayer_chrome_extension/src/js/transforms/junodownload')
const { queryStoreId } = require('../../shared/db/store.js')
const junoApi = require('./juno-api.js')
const logger = require('fomoplayer_shared').logger(__filename)

const storeName = (module.exports.storeName = 'Juno Download')
module.exports.storeUrl = 'https://www.junodownload.com'
module.exports.getPlaylistId = (id) => id

let storeDbId = null
const getStoreDbId = () => {
  if (storeDbId) return Promise.resolve(storeDbId)
  return queryStoreId(storeName).then((store_id) => {
    storeDbId = store_id
    return storeDbId
  })
}

module.exports.getPlaylistName = async ({ url }) => {
  const { name } = await junoApi.getPageInfo(url)
  return name
}

module.exports.getFollowDetails = async ({ id, url, type }) => {
  let details
  if (type === 'artist' || type === 'label') {
    details = await junoApi.getPageInfo(url)
  } else if (type === 'playlist') {
    details = { id: url, name: await module.exports.getPlaylistName({ url }), type: 'playlist' }
  } else {
    throw new Error('Regex type not handled in code!')
  }
  return [{ id, ...details, type, store: { name: storeName.toLowerCase() }, url }]
}

const getTracksFromReleases = async (releaseUrls) => {
  const errors = []
  const releaseDetails = []
  for (const releaseUrl of releaseUrls) {
    try {
      const data = await junoApi.getReleaseFromUrl(releaseUrl)
      releaseDetails.push(data)
    } catch (e) {
      if (e.isRateLimit) {
        logger.error('Rate limit reached while fetching release details', { releaseUrl, error: e.message })
        throw e
      }
      logger.error(`Failed to fetch release from ${releaseUrl}`, e)
      errors.push([`Failed to fetch release from ${releaseUrl}`, e])
    }
  }
  const transformed = junodownloadReleasesTransform(releaseDetails)
  return { errors, tracks: transformed }
}

module.exports.getArtistTracks = async function* ({ url }) {
  try {
    const { releaseUrls } = await junoApi.getPageInfo(url)
    for (const releaseUrl of R.uniq(releaseUrls)) {
      if (junoApi.static.isRateLimited()) {
        logger.error('Rate limit reached, stopping iteration for artist tracks')
        return
      }
      try {
        yield await getTracksFromReleases([releaseUrl])
      } catch (e) {
        if (e.isRateLimit) throw e
        yield { tracks: [], errors: [e] }
      }
    }
  } catch (e) {
    if (e.isRateLimit) throw e
    throw e
  }
}

module.exports.getLabelTracks = async function* ({ url }) {
  try {
    const { releaseUrls } = await junoApi.getPageInfo(url)
    for (const releaseUrl of R.uniq(releaseUrls)) {
      if (junoApi.static.isRateLimited()) {
        logger.error('Rate limit reached, stopping iteration for label tracks')
        return
      }
      try {
        yield await getTracksFromReleases([releaseUrl])
      } catch (e) {
        if (e.isRateLimit) throw e
        yield { tracks: [], errors: [e] }
      }
    }
  } catch (e) {
    if (e.isRateLimit) throw e
    throw e
  }
}

module.exports.getPlaylistTracks = async function* ({ playlistStoreId: url }) {
  try {
    const { releaseUrls } = await junoApi.getPageInfo(url)
    const unique = R.uniq(releaseUrls)
    for (const releaseUrl of unique) {
      if (junoApi.static.isRateLimited()) {
        logger.error('Rate limit reached, stopping iteration for playlist tracks')
        return
      }
      try {
        yield await getTracksFromReleases([releaseUrl])
      } catch (e) {
        if (e.isRateLimit) throw e
        yield { tracks: [], errors: [e] }
      }
    }
  } catch (e) {
    if (e.isRateLimit) throw e
    throw e
  }
}

module.exports.getArtistName = module.exports.getLabelName = async (url) => {
  const { name } = await junoApi.getPageInfo(url)
  return name
}

module.exports.getTrackInfo = async (url) => {
  const data = await junoApi.getReleaseFromUrl(url)
  const trackIndex = (() => {
    const trackNum = (new URL(url).searchParams.get('track_number') || '1').replace(/^0+/, '') || '1'
    return parseInt(trackNum, 10) - 1
  })()
  const track = data.tracks && data.tracks[trackIndex] ? data.tracks[trackIndex] : (data.tracks && data.tracks[0]) || null
  if (!track) {
    logger.error(`Track not found at ${url}`)
    throw new Error(`Track not found at ${url}`)
  }
  const { junodownloadTrackTransform } = require('fomoplayer_chrome_extension/src/js/transforms/junodownload')
  return junodownloadTrackTransform(track)
}

module.exports.search = async (query) => {
  const results = await junoApi.searchApi(query)
  return results.map((item) => ({ ...item, store: { name: storeName.toLowerCase() } }))
}

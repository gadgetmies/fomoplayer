const BPromise = require('bluebird')
const R = require('ramda')
const bpApi = require('./bp-api')
const { processChunks } = require('../../shared/requests')

const { queryFollowRegexes } = require('../../shared/db/store.js')
const {
  beatportTracksTransform,
  beatportTrackTransform
} = require('multi_store_player_chrome_extension/src/js/transforms/beatport')
const logger = require('../../../logger')(__filename)

const bpApiStatic = BPromise.promisifyAll(bpApi.staticFns)

// TODO: add export?
const storeName = (module.exports.storeName = 'Beatport')
module.exports.storeUrl = 'https://www.beatport.com'
module.exports.getPlaylistId = id => id

const getPlaylistName = (module.exports.getPlaylistName = async (type, url) => {
  const { name } = await bpApiStatic.getDetailsAsync(url)
  return name
})

const getFollowDetailsFromUrl = (module.exports.getFollowDetailsFromUrl = async urlString => {
  const regexes = await queryFollowRegexes(storeName)
  const store = { name: storeName.toLowerCase() }
  for (const { regex, type } of regexes) {
    const match = urlString.match(regex)
    if (match) {
      const id = match[1]
      return { id, type }
    }
  }

  throw new Error(`URL ${urlString} did not match any regex`)
})

module.exports.getFollowDetails = async urlString => {
  const { id, type } = await getFollowDetailsFromUrl(urlString)
  let details

  if (type === 'artist' || type === 'label') {
    details = await bpApiStatic.getDetailsAsync(urlString)
  } else if (type === 'playlist') {
    details = await getPlaylistName(type, urlString)
  } else {
    throw new Error('Regex type not handled in code!')
  }

  return [{ id, ...details, type, store, url: urlString }]
}

const getTrackInfo = (module.exports.getTrackInfo = async url => {
  const queryData = await bpApiStatic.getQueryDataOnPageAsync(url)
  const transformed = beatportTrackTransform(queryData.data.props.pageProps.track)

  if (!transformed) {
    const error = `Track data extraction failed: ${url}`
    logger.error(error)
    throw new Error(error)
  }

  return transformed
})

function trackInfo([{ url }]) {
  return getTrackInfo(url)
}

const appendTrackNumbers = async tracks => {
  try {
    const trackInfos = await processChunks(tracks, 4, trackInfo, { concurrency: 4 })

    // TODO: yield
    return tracks.map(({ id, ...rest }) => ({
      id,
      ...rest,
      track_number: trackInfos.find(track => id === track?.id)?.track_number
    }))
  } catch (e) {
    logger.error(`appendTrackNumbers failed: ${e.toString().substring(0, 100)}`)
  }
}

module.exports.getArtistTracks = async function*({ artistStoreId }) {
  const artistQueryData = await bpApiStatic.getArtistQueryDataAsync(artistStoreId, 1)
  const transformed = beatportTracksTransform(artistQueryData)

  if (transformed.length === 0) {
    const warning = `No tracks found for artist ${artistStoreId}`
    logger.warn(warning)
    yield { tracks: [], errors: [] }
  }

  yield { tracks: await appendTrackNumbers(transformed), errors: [] }
}

module.exports.getLabelName = module.exports.getArtistName = async url => {
  const { name } = await bpApiStatic.getDetailsAsync(url)
  return name
}

module.exports.getLabelTracks = async function*({ labelStoreId }) {
  const labelQueryData = await bpApiStatic.getLabelQueryDataAsync(labelStoreId, 1)
  const transformed = beatportTracksTransform(labelQueryData)

  if (transformed.length === 0) {
    const warning = `No tracks found for label ${labelStoreId}`
    logger.warn(warning, { labelStoreId })
    yield { tracks: [], errors: [] }
  }

  yield { tracks: await appendTrackNumbers(transformed), errors: [] }
}

module.exports.getPlaylistTracks = async function*({ playlistStoreId: url }) {
  const queryData = await bpApiStatic.getQueryDataOnPageAsync(url)
  const transformed = beatportTracksTransform(queryData.data.tracks)

  if (transformed.length === 0) {
    const warning = `No tracks found for playlist at ${url}`
    logger.warn(warning)
    return { tracks: [], errors: [] }
  }

  yield { tracks: await appendTrackNumbers(transformed), errors: [] }
}

module.exports.search = async query => {
  const promises = [bpApiStatic.searchForArtistsAsync(query), bpApiStatic.searchForLabelsAsync(query)]
  return (await Promise.all(promises))
    .reduce((acc, { results }) => acc.concat(results), [])
    .map(item => ({ ...item, store: { name: storeName.toLowerCase() } }))
}

module.exports.getTracksForISRCs = async isrcs => {
  const tracks = (
    await processChunks(
      isrcs,
      1,
      async ([trackISRC]) => {
        const { results, buildId } = await bpApiStatic.searchForTracksAsync(trackISRC)
        if (results.length === 0) return []
        // TODO: remove duplicates
        return await bpApiStatic.getTrackQueryDataAsync(results[0].id, buildId)
      },
      { concurrency: 1 }
    )
  ).flat()
  return R.uniq(
    tracks
      .map(beatportTracksTransform)
      .flat()
      .filter(({ isrc }) => isrcs.includes(isrc))
  )
}

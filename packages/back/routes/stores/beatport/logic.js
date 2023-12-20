const BPromise = require('bluebird')
const R = require('ramda')
const bpApi = require('./bp-api')
const { processChunks } = require('../../shared/requests')

const {
  beatportTracksTransform,
  beatportTrackTransform
} = require('fomoplayer_chrome_extension/src/js/transforms/beatport')
const logger = require('fomoplayer_shared').logger(__filename)

const bpApiStatic = BPromise.promisifyAll(bpApi.staticFns)

// TODO: add export?
const storeName = (module.exports.storeName = 'Beatport')
module.exports.storeUrl = 'https://www.beatport.com'
module.exports.getPlaylistId = id => id

const getPlaylistName = (module.exports.getPlaylistName = async ({ url }) => {
  const { name } = await bpApiStatic.getDetailsAsync(url)
  return name
})

module.exports.getFollowDetails = async ({ id, url, type }) => {
  let details

  if (type === 'artist' || type === 'label') {
    details = await bpApiStatic.getDetailsAsync(url)
  } else if (type === 'playlist') {
    details = { id: url, name: await getPlaylistName({ url }) }
  } else {
    throw new Error('Regex type not handled in code!')
  }

  return [{ id, ...details, type, store: { name: storeName }, url }]
}

const getTrackInfo = async (url) => {
  const queryData = await bpApiStatic.getQueryDataOnPageAsync(url)
  const transformed = beatportTrackTransform(queryData.data.props.pageProps.track)

  if (!transformed) {
    const error = `Track data extraction failed: ${url}`
    logger.error(error)
    throw new Error(error)
  }

  return transformed
}

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

module.exports.getLabelName = module.exports.getArtistName = async ({ url }) => {
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

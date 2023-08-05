const BPromise = require('bluebird')
const L = require('partial.lenses')
const bpApi = require('./bp-api')

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

module.exports.getFollowDetails = async urlString => {
  const regexes = await queryFollowRegexes(storeName)
  const store = { name: storeName.toLowerCase() }
  let details

  for (const { regex, type } of regexes) {
    const match = urlString.match(regex)
    if (match) {
      const id = match[1]
      if (type === 'artist' || type === 'label') {
        details = await bpApiStatic.getDetailsAsync(urlString)
      } else if (type === 'playlist') {
        details = await getPlaylistName(type, urlString)
      } else {
        throw new Error('URL did not match any regex')
      }

      return [{ id, ...details, type, store, url: urlString }]
    }
  }

  return []
}

const getTrackInfo = (module.exports.getTrackInfo = async url => {
  const queryData = await bpApiStatic.getQueryDataOnPageAsync(url)
  const transformed = beatportTrackTransform(queryData.data.props.pageProps.track)

  if (!transformed || transformed.length === 0) {
    const error = `Track data extraction failed: ${url}`
    logger.error(error)
    throw new Error(error)
  }

  return transformed[0]
})

const appendTrackNumbers = async tracks => {
  try {
    const trackInfos = await BPromise.map(
      tracks,
      async ({ id, url }) => {
        try {
          //  TODO: yield?
          return await getTrackInfo(url)
        } catch (e) {
          logger.error(e)
          return {}
        }
      },
      { concurrency: 4 }
    ).catch(e => {
      logger.error(e)
    })

    // TODO: yield
    return tracks.map(({ id, ...rest }) => ({
      id,
      ...rest,
      track_number: trackInfos.find(track => id === track?.id)?.track_number
    }))
  } catch (e) {
    logger.error(`appendTrackNumbers failed: ${e.toString()}`)
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
    .reduce((acc, curr) => acc.concat(curr), [])
    .map(item => ({ ...item, store: { name: storeName.toLowerCase() } }))
}

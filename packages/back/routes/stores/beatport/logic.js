const BPromise = require('bluebird')
const bpApi = require('bp-api')

const { queryFollowRegexes } = require('../../shared/db/store.js')
const { beatportTracksTransform } = require('multi_store_player_chrome_extension/src/js/transforms/beatport')
const logger = require('../../../logger')(__filename)

const bpApiStatic = BPromise.promisifyAll(bpApi.staticFns)

// TODO: add export?
const storeName = (module.exports.storeName = 'Beatport')
module.exports.storeUrl = 'https://www.beatport.com'

const getArtistName = (module.exports.getArtistName = async url => {
  const title = await bpApiStatic.getTitleAsync(url)
  return title.replace(' music download - Beatport', '')
})

const getLabelName = (module.exports.getLabelName = async url => {
  const title = await bpApiStatic.getTitleAsync(url)
  return title.replace(' artists & music download - Beatport', '')
})

module.exports.getPlaylistId = id => id

const getPlaylistName = (module.exports.getPlaylistName = async (type, url) => {
  return await bpApiStatic.getTitleAsync(url)
})

module.exports.getFollowDetails = async urlString => {
  const regexes = await queryFollowRegexes(storeName)
  const store = { name: storeName.toLowerCase() }
  let name

  for (const { regex, type } of regexes) {
    const match = urlString.match(regex)
    if (match) {
      const id = match[1]
      if (type === 'artist') {
        name = await getArtistName(urlString)
      } else if (type === 'label') {
        name = await getLabelName(urlString)
      } else if (type === 'playlist') {
        name = await getPlaylistName(type, urlString)
      } else {
        throw new Error('URL did not match any regex')
      }

      return [{ id, name, type, store, url: urlString }]
    }
  }

  return []
}

module.exports.getArtistTracks = async ({ artistStoreId }) => {
  const artistTracks = await bpApiStatic.getArtistTracksAsync(artistStoreId, 1)
  if (artistTracks.tracks.length === 0) {
    const error = `No tracks found for artist ${artistStoreId}`
    logger.error(error)
    throw new Error(error)
  }

  const transformed = beatportTracksTransform(artistTracks.tracks)
  if (transformed.length !== artistTracks.tracks.length) {
    logger.error('Artist track transform failed', { transformed, tracks: artistTracks.tracks })
  }

  return { tracks: transformed, errors: [] }
}

module.exports.getLabelTracks = async ({ labelStoreId }) => {
  const labelTracks = await bpApiStatic.getLabelTracksAsync(labelStoreId, 1)
  if (labelTracks.tracks.length === 0) {
    const error = `No tracks found for label ${labelStoreId}`
    logger.error(error, { labelStoreId })
    throw new Error(error)
  }

  const transformed = beatportTracksTransform(labelTracks.tracks)
  if (transformed.length !== labelTracks.tracks.length) {
    logger.error('Label track transform failed', { transformed, tracks: labelTracks.tracks })
  }

  return { tracks: transformed, errors: [] }
}

module.exports.getPlaylistTracks = async function*({ playlistStoreId: url }) {
  const playlist = await bpApiStatic.getTracksOnPageAsync(url)

  if (playlist.tracks.tracks === 0) {
    const error = `No tracks found for playlist at ${url}`
    logger.error(error)
    throw new Error(error)
  }

  const transformed = beatportTracksTransform(playlist.tracks.tracks)
  if (transformed.length !== playlist.tracks.tracks.length) {
    logger.error('Playlist track transform failed', { transformed, tracks: playlist.tracks.tracks })
  }

  yield { tracks: transformed, errors: [] }
}

module.exports.search = async query => {
  const promises = [bpApiStatic.searchForArtistsAsync(query), bpApiStatic.searchForLabelsAsync(query)]
  return (await Promise.all(promises))
    .reduce((acc, curr) => acc.concat(curr), [])
    .map(item => ({ ...item, store: { name: storeName.toLowerCase() } }))
}

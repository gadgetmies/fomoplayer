const { BadRequest } = require('../../shared/httpErrors')
const { spotifyApi, requestUserPlaylists } = require('../../shared/spotify.js')
const BPromise = require('bluebird')
const {
  spotifyTracksTransform,
  spotifyAlbumTracksTransform
} = require('multi_store_player_chrome_extension/src/js/transforms/spotify')
const R = require('ramda')
const { storeName, storeCode, getSpotifyTrackUris } = require('../../shared/spotify')
const { queryFollowRegexes } = require('../../shared/db/store')
const { processChunks } = require('../../shared/requests')
const logger = require('../../../logger')(__filename)

module.exports.storeUrl = 'https://www.spotify.com'
module.exports.storeName = storeName

const getUserPlaylists = (module.exports.getUserPlaylists = async userId => {
  logger.info('Fetching user playlists from Spotify', { userId })
  try {
    return await requestUserPlaylists(userId)
  } catch (e) {
    logger.error(`Fetching user (${userId}) playlists from Spotify failed`, e)
    throw e
  }
})

const getPlaylistDetails = (module.exports.getFollowDetails = async playlistId => {
  const details = await spotifyApi.getPlaylist(playlistId)
  const {
    name: title,
    owner: { display_name: author }
  } = details.body

  return { title, author }
})

module.exports.getPlaylistDetailsWithTracks = async playlistUrl => {
  const playlistId = getPlaylistId(playlistUrl)
  const generator = getPlaylistTracks({ playlistStoreId: playlistId })
  let tracks = []
  for await (const { tracks: t } of generator) {
    tracks = [...tracks, ...t]
  }

  const details = await getPlaylistDetails(playlistId)
  return { ...details, tracks }
}

const getArtistName = (module.exports.getArtistName = async url => {
  // TODO: get regex from db
  const artistId = url.match('^https://(api|open).spotify.com/(v1/)?artists?/([0-9A-Za-z]+)')[3]
  const {
    body: { name }
  } = await spotifyApi.getArtist(artistId)
  return name
})

const getPlaylistId = (module.exports.getPlaylistId = url => {
  const id = url.match(/^https:\/\/open.spotify.com\/playlist\/([0-9A-Za-z]*)/)[1]
  if (!id) {
    throw new BadRequest('Invalid Spotify URL')
  }

  return id
})

const getPlaylistName = (module.exports.getPlaylistName = async (type, url) => {
  const id = getPlaylistId(url)
  const { title, author } = await getPlaylistDetails(id)

  if (!title || !author) {
    throw new Error('Fetching playlist details failed')
  }

  return `${author}: ${title}`
})

module.exports.getFollowDetails = async urlString => {
  const regexes = await queryFollowRegexes(storeName)
  const store = { name: storeCode }
  let name
  for (const { regex, type } of regexes) {
    const match = urlString.match(regex)

    if (match) {
      const id = match[4]
      if (type === 'artist') {
        name = await getArtistName(urlString)
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

const getTracks = (module.exports.getTracks = async trackIds => {
  const { body, statusCode } = await spotifyApi.getTracks(trackIds)

  if (statusCode !== 200) {
    const error = `Failed to fetch details for tracks: ${JSON.stringify(trackIds)}`
    logger.error(error)
    throw new Error(error)
  }

  const trackInfos = body.tracks

  if (trackInfos.length !== trackIds.length) {
    const error = `Returned tracks length does not match the length of the track ids: ${JSON.stringify(
      trackIds
    )}, ${JSON.stringify(trackInfos)}`
    logger.error(error)
    throw new Error(error)
  }

  return trackInfos
})

const getTrackAudioFeatures = (module.exports.getTrackAudioFeatures = async trackIds => {
  const { body, statusCode } = await spotifyApi.getAudioFeaturesForTracks(trackIds)

  if (statusCode !== 200) {
    const error = `Failed to fetch details for tracks: ${JSON.stringify(trackIds)}`
    logger.error(error)
    throw new Error(error)
  }

  const trackAudioFeatures = body.audio_features

  if (trackAudioFeatures.length !== trackIds.length) {
    const error = `Returned track audio feature length does not match the length of the track ids: ${JSON.stringify(
      trackIds
    )}, ${JSON.stringify(trackAudioFeatures)}`
    logger.error(error)
    throw new Error(error)
  }

  return trackAudioFeatures
})

const appendTrackDetails = async tracks => {
  const trackIds = tracks.map(({ id }) => id)
  const [trackAudioFeatures, trackInfos] = await Promise.all([
    processChunks(trackIds, 100, getTrackAudioFeatures, { concurrency: 4 }),
    processChunks(trackIds, 50, getTracks, { concurrency: 4 })
  ])

  return tracks.map(({ id, ...rest }) => {
    const idMatch = track => id === track?.id
    const features = trackAudioFeatures.find(idMatch) || {}
    const info = trackInfos.find(idMatch) || {}

    return {
      id,
      features,
      bpm: features.tempo,
      isrc: info.external_ids?.isrc,
      ...rest
    }
  })
}

const getPlaylistTracks = (module.exports.getPlaylistTracks = async function*({ playlistStoreId }) {
  const res = await spotifyApi.getPlaylistTracks(playlistStoreId, { market: 'US' })
  const transformed = spotifyTracksTransform(res.body.items.filter(R.path(['track', 'preview_url'])))
  if (transformed.length === 0) {
    const error = `No tracks found for playlist at ${playlistStoreId}`
    logger.error(error)
    logger.debug('Spotify API response', { firstItem: res.body.items[0], items: res.body.items })
    throw new Error(error)
  }

  yield { tracks: await appendTrackDetails(transformed), errors: [] }
})

module.exports.getArtistTracks = async function*({ artistStoreId }) {
  const albumIds = (await spotifyApi.getArtistAlbums(artistStoreId)).body.items.map(R.prop('id'))
  const albums = (await spotifyApi.getAlbums(albumIds)).body.albums
  const transformed = R.flatten(spotifyAlbumTracksTransform(albums))
  if (transformed.length === 0) {
    const error = `No tracks found for artist ${artistStoreId}`
    logger.error(error)
    throw new Error(error)
  }

  yield { tracks: await appendTrackDetails(transformed), errors: [] }
}

module.exports.search = async query => {
  const items = (await spotifyApi.searchArtists(query)).body.artists.items
  return items.map(({ external_urls: { spotify }, id, name, type, images }) => ({
    url: spotify,
    id,
    name,
    store: { name: storeCode },
    type,
    img: images[0]?.url
  }))
}

module.exports.getTracksForISRCs = async isrcs => {
  const results = (
    await processChunks(isrcs, 1, ([isrc]) => spotifyApi.searchTracks(`isrc:${isrc}`), { concurrency: 4 })
  ).flat()
  const tracks = results.map(R.path(['body', 'tracks', 'items'])).flat()
  return spotifyTracksTransform(tracks)
}

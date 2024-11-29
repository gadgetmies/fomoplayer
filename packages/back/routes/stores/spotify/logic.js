const { BadRequest } = require('../../shared/httpErrors')
const {
  spotifyApi,
  storeName,
  storeCode,
  requestUserFollowedArtists,
  requestUserPlaylists,
} = require('../../shared/spotify.js')
const {
  spotifyTracksTransform,
  spotifyAlbumTracksTransform,
} = require('fomoplayer_chrome_extension/src/js/transforms/spotify')
const R = require('ramda')
const L = require('partial.lenses')
const { processChunks } = require('../../shared/requests')
const { addArtistsToUserFollowed } = require('../../shared/spotify')
const { getStoreDetailsFromUrls, getStoreDetailsFromUrl } = require('../logic')
const logger = require('fomoplayer_shared').logger(__filename)

module.exports.storeUrl = 'https://www.spotify.com'
module.exports.storeName = storeName

module.exports.getUserPlaylists = async (userId) => {
  logger.info('Fetching user playlists from Spotify', { userId })
  try {
    return await requestUserPlaylists(userId)
  } catch (e) {
    logger.error(`Fetching user (${userId}) playlists from Spotify failed`, e)
    throw e
  }
}

module.exports.getUserFollowedArtists = async (userId) => {
  logger.info("Fetching user's followed artists from Spotify", { userId })
  try {
    return await requestUserFollowedArtists(userId)
  } catch (e) {
    logger.error(`Fetching user (${userId}) followed artists from Spotify failed`, e)
    throw e
  }
}

module.exports.followArtists = async (userId, artistUrls) => {
  logger.info(`Following Spotify artists for user ${userId}`, { artistUrls })
  try {
    const artistIds = (await getStoreDetailsFromUrls(artistUrls, storeName)).map(({ id }) => id)
    await addArtistsToUserFollowed(userId, artistIds)
  } catch (e) {
    logger.error(`Following Spotify artists for user (${userId}) failed`, e)
    throw e
  }
}

const getPlaylistDetails = (module.exports.getPlaylistDetails = async (playlistId) => {
  const details = await spotifyApi.getPlaylist(playlistId)
  const {
    name: title,
    owner: { display_name: author },
  } = details.body

  return { title, author }
})

module.exports.getPlaylistDetailsWithTracks = async (playlistUrl) => {
  const playlistId = getPlaylistId(playlistUrl)
  const generator = getPlaylistTracks({ playlistStoreId: playlistId })
  let tracks = []
  for await (const { tracks: t } of generator) {
    tracks = [...tracks, ...t]
  }
  logger.info(`Got ${tracks.length} tracks for playlist ${playlistId}`)

  const details = await getPlaylistDetails(playlistId)
  return { ...details, tracks }
}

const getArtistDetails = (module.exports.getArtistDetails = async (url) => {
  // TODO: get regex from db
  const artistId = url.match('^https://(api|open).spotify.com/(v1/)?artists?/([0-9A-Za-z]+)')[3]
  const res = await spotifyApi.getArtist(artistId)
  const {
    body: { name, genres, id },
  } = res
  return { id, name, genres: genres.map((name) => ({ name, id: name })), url }
})

const getArtistsDetails = async (artistIds) => {
  const {
    body: { artists },
  } = await spotifyApi.getArtists(artistIds)
  return artists.map(({ genres, ...rest }) => ({ genres: genres.map((name) => ({ name, id: name })), ...rest }))
}

const getArtistName = (module.exports.getArtistName = async (url) => (await getArtistDetails(url)).name)

const getPlaylistId = (module.exports.getPlaylistId = (url) => {
  const id = url.match(/^https:\/\/open.spotify.com\/playlist\/([0-9A-Za-z]*)/)[1]
  if (!id) {
    throw new BadRequest('Invalid Spotify URL')
  }

  return id
})

const getPlaylistName = (module.exports.getPlaylistName = async (url) => {
  const id = getPlaylistId(url)
  const { title, author } = await getPlaylistDetails(id)

  if (!title || !author) {
    throw new Error('Fetching playlist details failed')
  }

  return `${author}: ${title}`
})

module.exports.getFollowDetails = async ({ id, type, url }) => {
  let name

  if (type === 'artist') {
    name = await getArtistName(url)
  } else if (type === 'playlist') {
    name = await getPlaylistName({ url, type })
  } else {
    throw new Error('Regex type not handled in code!')
  }

  return [{ id, name, type, store: { name: storeCode }, url }]
}

module.exports.getTracks = getTracks
async function getTracks(trackIds) {
  const { body, statusCode } = await spotifyApi.getTracks(trackIds)

  if (statusCode !== 200) {
    const error = `Failed to fetch details for tracks: ${JSON.stringify(trackIds)}`
    logger.error(error)
    throw new Error(error)
  }

  const trackInfos = body.tracks

  if (trackInfos.length !== trackIds.length) {
    const error = `Returned tracks length does not match the length of the track ids: ${JSON.stringify(
      trackIds,
    )}, ${JSON.stringify(trackInfos)}`
    logger.error(error)
    throw new Error(error)
  }

  return trackInfos
}

module.exports.getTrackAudioFeatures = getTrackAudioFeatures
async function getTrackAudioFeatures(trackIds) {
  const { body, statusCode } = await spotifyApi.getAudioFeaturesForTracks(trackIds)

  if (statusCode !== 200) {
    const error = `Failed to fetch details for tracks: ${JSON.stringify(trackIds)}`
    logger.error(error)
    throw new Error(error)
  }

  const trackAudioFeatures = body.audio_features

  if (trackAudioFeatures.length !== trackIds.length) {
    const error = `Returned track audio feature length does not match the length of the track ids: ${JSON.stringify(
      trackIds,
    )}, ${JSON.stringify(trackAudioFeatures)}`
    logger.error(error)
    throw new Error(error)
  }

  return trackAudioFeatures
}

const appendTrackDetails = async (tracks) => {
  const trackIds = tracks.map(({ id }) => id)
  const [trackAudioFeatures, trackInfos] = await Promise.all([
    processChunks(trackIds, 100, getTrackAudioFeatures, { concurrency: 4 }),
    processChunks(trackIds, 50, getTracks, { concurrency: 4 }),
  ])

  return tracks.map(({ id, ...rest }) => {
    const idMatch = (track) => id === track?.id
    const features = trackAudioFeatures.find(idMatch) || {}
    const info = trackInfos.find(idMatch) || {}

    return {
      id,
      features,
      bpm: features.tempo,
      isrc: info.external_ids?.isrc,
      ...rest,
    }
  })
}

const appendArtistDetails = async (tracks) => {
  const artistIds = R.uniq(L.collect([L.elems, 'artists', L.elems, 'id'], tracks))
  const artistDetails = await processChunks(artistIds, 50, getArtistsDetails, { concurrency: 4 })
  return tracks.map(({ artists, ...rest }) => {
    return {
      artists: artists.map(({ id, ...rest }) => ({
        id,
        genres: artistDetails.find(({ id: aid }) => aid === id).genres,
        ...rest,
      })),
      ...rest,
    }
  })
}

const getPlaylistTracks = (module.exports.getPlaylistTracks = async function* ({ playlistStoreId }) {
  const res = await spotifyApi.getPlaylistTracks(playlistStoreId, { market: 'US' })
  const transformed = spotifyTracksTransform(res.body.items)
  if (transformed.length === 0) {
    const error = `No tracks found for playlist at ${playlistStoreId}`
    logger.error(error)
    logger.debug('Spotify API response', { firstItem: res.body.items[0], items: res.body.items })
    throw new Error(error)
  }

  yield { tracks: await appendArtistDetails(await appendTrackDetails(transformed)), errors: [] }
})

module.exports.getArtistTracks = async function* ({ artistStoreId }) {
  const albumIds = (await spotifyApi.getArtistAlbums(artistStoreId)).body.items.map(R.prop('id'))
  const albums = (await spotifyApi.getAlbums(albumIds)).body.albums
  const transformed = R.flatten(spotifyAlbumTracksTransform(albums))
  if (transformed.length === 0) {
    const error = `No tracks found for artist ${artistStoreId}`
    logger.error(error)
    throw new Error(error)
  }

  yield { tracks: await appendArtistDetails(await appendTrackDetails(transformed)), errors: [] }
}

module.exports.search = async (query) => {
  const items = (await spotifyApi.searchArtists(query)).body.artists.items
  return items.map(({ external_urls: { spotify }, id, name, type, images }) => ({
    url: spotify,
    id,
    name,
    store: { name: storeCode },
    type,
    img: images[0]?.url,
  }))
}

function processIsrc([isrc]) {
  return spotifyApi.searchTracks(`isrc:${isrc}`)
}

module.exports.getTracksForISRCs = async (isrcs) => {
  const results = (await processChunks(isrcs, 1, processIsrc, { concurrency: 4 })).flat()
  const tracks = results.map(R.path(['body', 'tracks', 'items'])).flat()
  return spotifyTracksTransform(tracks)
}

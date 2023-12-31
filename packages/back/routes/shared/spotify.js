if (process.env.SPOTIFY_ACCOUNTS_REDIRECT || process.env.SPOTIFY_API_REDIRECT || process.env.SPOTIFY_MOCK) {
  require('fomoplayer_shared').interceptors.spotify.init()
}

const SpotifyWebApi = require('spotify-web-api-node')
const logger = require('fomoplayer_shared').logger(__filename)
const { apiURL } = require('../../config.js')
const { queryAuthorization, upsertUserAuthorizationTokens } = require('../db')
const R = require('ramda')
const L = require('partial.lenses')
const { processChunks } = require('./requests')

const storeName = (module.exports.storeName = 'Spotify')
module.exports.storeCode = storeName.toLocaleLowerCase()

const clientId = process.env.SPOTIFY_CLIENT_ID
const credentials = {
  clientId,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: `${apiURL}/auth/spotify/callback`
}

let suspendedUntil = undefined
const api = new SpotifyWebApi(credentials)
const spotifyApi = (module.exports.spotifyApi = L.modify(
  L.query(L.when(R.is(Function))),
  fn => (...args) => {
    console.log(fn)
    if (suspendedUntil && suspendedUntil > new Date()) {
      throw new Error(`Too many calls to Spotify API. Waiting for rate limit to expire at ${suspendedUntil}`)
    } else {
      const res = fn.bind(api)(...args)
      if (res instanceof Promise) {
        return res.catch(e => {
          if (e.statusCode === 429) {
            const retryAfterMs = e.headers['retry-after'] * 1000
            logger.error(`Spotify API rate limit exceeded (response status code 429), suspending for ${retryAfterMs}ms`)
            suspendedUntil = new Date(Date.now() + retryAfterMs)
            throw new Error('Too many calls to Spotify API')
          } else {
            logger.error('Spotify API error', e)
            throw e
          }
        })
      } else {
        return res
      }
    }
  },
  api
))


const getApiForAuthorization = (module.exports.getApiForAuthorization = (accessToken, refreshToken = undefined) => {
  const api = new SpotifyWebApi(credentials)
  api.setAccessToken(accessToken)
  api.setRefreshToken(refreshToken)
  return api
})

const getApiForUser = (module.exports.getApiForUser = async userId => {
  const { access_token, refresh_token, expires } = await queryAuthorization(userId)
  const api = getApiForAuthorization(access_token, refresh_token)
  if (new Date(expires) < new Date()) {
    const { body, statusCode } = await api.refreshAccessToken()

    if (statusCode === 200) {
      const { access_token, expires_in } = body
      await upsertUserAuthorizationTokens(userId, storeName, access_token, refresh_token, expires_in)
      api.setAccessToken(access_token)
    } else {
      const errorMessage = `Refreshing access token failed for user: ${userId}`
      logger.error(`${errorMessage}: ${JSON.stringify(body)}`)
      throw new Error(errorMessage)
    }
  }
  return api
})

const refreshToken = (module.exports.refreshToken = async () => {
  logger.debug('Refreshing Spotify token')
  try {
    const data = await spotifyApi.clientCredentialsGrant()
    spotifyApi.setAccessToken(data.body['access_token'])
    const expiresIn = data.body['expires_in']
    logger.debug(`Refreshing token in ${expiresIn / 2} seconds`)
    setTimeout(refreshToken, (expiresIn / 2) * 1000)
    logger.debug('Done refreshing Spotify token')
  } catch (e) {
    logger.error('Spotify token refresh failed', e)
  }
})

module.exports.getAuthorizationUrl = (state) => {
  // Create the authorization URL
  const scopes = [
    'playlist-modify-private',
    'playlist-modify-public',
    'playlist-read-private',
    'user-follow-read',
    'user-follow-modify'
  ]
  return spotifyApi.createAuthorizeURL(scopes, state)
}

module.exports.requestTokens = code => spotifyApi.authorizationCodeGrant(code)
;(async () => {
  await refreshToken()
})()

const getSpotifyTrackUris = (module.exports.getSpotifyTrackUris = tracks =>
  tracks
    .map(({ stores }) => stores.find(({ name }) => storeName === name))
    .filter(R.identity)
    .map(({ trackId }) => `spotify:track:${trackId}`))

const setCartTracks = (module.exports.setCartTracks = async (api, cartStoreId, tracks) => {
  const spotifyTrackUrls = getSpotifyTrackUris(tracks)
  const chunks = R.splitEvery(100, spotifyTrackUrls)
  await api.replaceTracksInPlaylist(cartStoreId, chunks[0])
  for (const chunk of chunks.slice(1)) {
    await api.addTracksToPlaylist(cartStoreId, chunk)
  }
})

module.exports.createCart = async (userId, cartName, tracks) => {
  const api = await getApiForUser(userId)
  const { body: playlist, statusCode } = await api.createPlaylist(cartName)
  if (statusCode !== 201) {
    throw new Error('Creating Spotify playlist failed')
  }
  await setCartTracks(api, playlist.id, tracks)

  const {
    id,
    external_urls: { spotify },
    snapshot_id
  } = playlist
  return { id, url: spotify, versionId: snapshot_id }
}

module.exports.removeTracksFromSyncedCart = async (userId, trackDetails, cartStoreDetails) => {
  const trackUris = getSpotifyTrackUris(trackDetails).map(uri => ({
    uri
  }))
  if (trackUris.length > 0) {
    const { cartStoreId } = cartStoreDetails
    const api = await getApiForUser(userId)
    const { snapshot_id } = await api.removeTracksFromPlaylist(cartStoreId, trackUris)
    return snapshot_id
  }
}

module.exports.addTracksToSyncedCart = async (userId, trackDetails, cartStoreDetails) => {
  const trackUris = getSpotifyTrackUris(trackDetails)
  if (trackUris.length > 0) {
    const api = await getApiForUser(userId)
    const { cartStoreId } = cartStoreDetails
    const { body: playlist } = await api.getPlaylist(cartStoreId)
    const storeTrackUris = playlist.tracks.items.map(({ track: { uri } }) => uri)
    const newTrackUris = R.difference(trackUris, storeTrackUris)

    if (newTrackUris.length > 0) {
      const { snapshot_id } = await api.addTracksToPlaylist(cartStoreId, newTrackUris)
      return snapshot_id
    }
  }
}

module.exports.requestUserPlaylists = async userId => {
  const api = await getApiForUser(userId)
  const res = await api.getUserPlaylists()
  const {
    body: { items }
  } = res
  return items.map(({ id, name, external_urls: { spotify }, images }) => ({
    id,
    name,
    url: spotify,
    img: images[0]?.url
  }))
}

module.exports.requestUserFollowedArtists = async userId => {
  const api = await getApiForUser(userId)
  const res = await api.getFollowedArtists()
  const {
    body: {
      artists: { items }
    }
  } = res

  return items.map(({ id, name, external_urls: { spotify }, images }) => ({
    id,
    name,
    url: spotify,
    img: images[0]?.url
  }))
}

module.exports.addArtistsToUserFollowed = async (userId, artistIds) => {
  const api = await getApiForUser(userId)
  await processChunks(artistIds, 50, api.followArtists.bind(api), { concurrency: 4 })
}
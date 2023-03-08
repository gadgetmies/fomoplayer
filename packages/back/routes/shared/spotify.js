const SpotifyWebApi = require('spotify-web-api-node')
const logger = require('../../logger')(__filename)

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET
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

;(async () => {
  await refreshToken()
})()

module.exports = {
  spotifyApi,
  refreshToken
}

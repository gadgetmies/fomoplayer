const SpotifyWebApi = require('spotify-web-api-node')

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET
})

spotifyApi.clientCredentialsGrant().then(function(data) {
  spotifyApi.setAccessToken(data.body['access_token'])
  spotifyApi.setRefreshToken(data.body['refresh_token'])
})

module.exports = spotifyApi

const SpotifyWebApi = require('spotify-web-api-node')

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET
})

spotifyApi.clientCredentialsGrant().then(function(data) {
  console.log('The access token expires in ' + data.body['expires_in'])
  console.log('The access token is ' + data.body['access_token'])

  // Save the access token so that it's used in future calls
  spotifyApi.setAccessToken(data.body['access_token'])
})

module.exports = spotifyApi

const interceptor = require('./interceptor.js')
const { SpotifyUrlRegex } = require('../integrations/spotify')
const spotifyTokenMock = require('./fixtures/spotify-token.json')
const spotifySearchMock = require('./fixtures/spotify-search.json')

const spotifyMock = process.env.SPOTIFY_MOCK
const spotifyApiRedirect = process.env.SPOTIFY_API_REDIRECT
const spotifyAccountsRedirect = process.env.SPOTIFY_ACCOUNTS_REDIRECT
const ACTUAL_SPOTIFY_ACCOUNTS_URL = 'https://accounts.spotify.com'
const ACTUAL_SPOTIFY_API_URL = 'https://api.spotify.com'

module.exports.init = () =>
  interceptor.init({
    proxies: [
      {
        test: ({ url }) => spotifyApiRedirect && url.startsWith(ACTUAL_SPOTIFY_API_URL),
        url: ({ url }) => {
          return url.replace(ACTUAL_SPOTIFY_API_URL, spotifyApiRedirect)
        }
      },
      {
        test: ({ url }) => spotifyAccountsRedirect && url.startsWith(ACTUAL_SPOTIFY_ACCOUNTS_URL),
        url: ({ url }) => {
          return url.replace(ACTUAL_SPOTIFY_ACCOUNTS_URL, spotifyAccountsRedirect)
        }
      }
    ],
    mocks: [
      {
        test: ({ pathname }) => spotifyMock && pathname === '/v1/search/',
        getResponse: () => ({
          body: spotifySearchMock,
          options: {
            headers: {
              'content-type': 'application/json'
            }
          }
        })
      },
      {
        test: ({ pathname }) => spotifyMock && pathname === '/api/token',
        getResponse: () => ({
          body: spotifyTokenMock,
          options: {
            headers: {
              'content-type': 'application/json'
            }
          }
        })
      }
    ],
    name: 'Spotify',
    regex: SpotifyUrlRegex
  })

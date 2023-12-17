const interceptor = require('./interceptor.js')
const { SpotifyUrlRegex } = require('../integrations/spotify')
const spotifyTokenMock = require('./fixtures/spotify-token.json')
const spotifySearchMock = require('./fixtures/spotify-search.json')

const spotifyApiRedirect = process.env.SPOTIFY_API_REDIRECT
const spotifyAccountsRedirect = process.env.SPOTIFY_ACCOUNTS_REDIRECT

module.exports.init = () =>
  interceptor.init({
    proxies: [
      {
        test: ({ url }) => spotifyApiRedirect && url.startsWith('https://api'),
        url: ({ url }) => {
          const newUrl = new URL(url)
          newUrl.host = spotifyApiRedirect
          newUrl.protocol = 'http'
          return newUrl.toString()
        }
      },
      {
        test: ({ url }) => spotifyAccountsRedirect && url.startsWith('https://accounts'),
        url: ({ url }) => {
          const newUrl = new URL(url)
          newUrl.host = spotifyAccountsRedirect
          newUrl.protocol = 'http'
          return newUrl.toString()
        }
      }
    ],
    mocks: [
      {
        test: ({ pathname }) => pathname === '/v1/search/',
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
        test: ({ pathname }) => pathname === '/api/token',
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

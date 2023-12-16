const { BatchInterceptor } = require('@mswjs/interceptors')
const { default: nodeInterceptors } = require('@mswjs/interceptors/presets/node')
const R = require('ramda')
const { SpotifyUrlRegex } = require('../../routes/shared/spotify')
const logger = require('../../logger')(__filename)
const spotifySearchMock = require('../fixtures/spotify-search.json')

const spotifyApiRedirect = process.env.SPOTIFY_API_REDIRECT
const spotifyAccountsRedirect = process.env.SPOTIFY_ACCOUNTS_REDIRECT

module.exports.init = function init() {
  console.log('Enabling development / test http request interceptors')
  const interceptor = new BatchInterceptor({
    name: 'my-interceptor',
    interceptors: nodeInterceptors
  })

  interceptor.apply()

  interceptor.on('request', async (...args) => {
    const { request } = args[0]
    const clone = request.clone()
    if (clone.url.match(require('../../routes/shared/spotify').SpotifyUrlRegex)) {
      if (spotifyAccountsRedirect && spotifyApiRedirect) {
        const proxyUrl = clone.url.startsWith('https://api')
          ? spotifyApiRedirect
          : clone.url.startsWith('https://accounts')
          ? spotifyAccountsRedirect
          : null

        if (proxyUrl === null) {
          logger.info('Not proxying Spotify request', clone.url)
          return request.end(...args)
        }

        logger.info(`Proxying Spotify request to ${proxyUrl}`)
        const requestBody = await clone.text()
        const rewrittenUrl = clone.url.replace(SpotifyUrlRegex, `${proxyUrl}$1`)

        const options = {
          method: clone.method,
          headers: {
            authorization: clone.headers.get('authorization')
          },
          body: requestBody,
          duplex: clone.duplex
        }
        const res = await fetch(rewrittenUrl, request)
        const responseJson = await res.json()
        const headers = Object.fromEntries(res.headers)

        return request.respondWith(
          new Response(JSON.stringify(responseJson), {
            status: 200,
            statusText: 'OK',
            headers: R.omit(['content-encoding'], headers)
          })
        )
      } else if (!process.env.SPOTIFY_CLIENT_ID) {
        console.log('Mocking Spotify request', request.url)
        const pathname = new URL(request.url).pathname
        if (pathname === '/api/token') {
          console.log('Mocking Spotify token request')
          return request.respondWith(
            new Response(
              JSON.stringify({
                access_token:
                  'N1wMzKzFp1tizANHvBYPdLksvSXXZ1fg5-HHdzgvLXzqVRaXABvP4jV8QpiufZf88rMdQgAD7itQMzyHm1waBr5eGUWGMvaw1I_cP_CuyaLYgHe6hMi',
                token_type: 'Bearer',
                expires_in: 3600
              }),
              {
                status: 200,
                statusText: 'OK',
                headers: {
                  'content-type': 'application/json'
                }
              }
            )
          )
        } else if (pathname === '/v1/search/') {
          console.log('Mocking Spotify search')
          return request.respondWith(
            new Response(
              JSON.stringify(spotifySearchMock),
              {
                status: 200,
                statusText: 'OK',
                headers: {
                  'content-type': 'application/json'
                }
              }
            )
          )
        } else {
          throw new Error(`Request not mocked ${pathname}`)
        }
      }
    }

    console.log('Returning request without modifications')
    return request.end(...args)
  })
}

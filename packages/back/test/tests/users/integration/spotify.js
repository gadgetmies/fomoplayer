const spotifyInterceptor = require('../../../lib/spotifyInterceptor').init()
const { test } = require('../../../lib/test')

const { spotifyApi, refreshToken } = require('../../../../routes/shared/spotify')
const assert = require('assert')

const spotifySearchMock = require('../../../fixtures/spotify-search.json')

test({
  setup: async () => {
    await refreshToken()
  },
  skip: () =>
    process.env.SPOTIFY_API_REDIRECT !== '' ||
    process.env.SPOTIFY_ACCOUNTS_REDIRECT !== '' ||
    process.env.SPOTIFY_CLIENT_ID !== '' ||
    process.env.SPOTIFY_CLIENT_SECRET !== ''
      ? 'Spotify redirects or credentials set'
      : undefined,
  'requests are intercepted': async () => {
    const res = await spotifyApi.search('noisia', ['track', 'artist', 'album'], { limit: 10 })
    console.log({ res })
    assert.equal(res.statusCode, 200)
    assert.equal(res.headers['content-type'], 'application/json')
    assert.equal(spotifyInterceptor.mockedRequests.length, 2)
    assert.notEqual(
      spotifyInterceptor.mockedRequests.find(({ url }) => new URL(url).pathname === '/v1/search/'),
      undefined
    )
    assert.deepEqual(res.body, spotifySearchMock)
  }
})

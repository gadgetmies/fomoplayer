const spotifyInterceptor = require('fomoplayer_shared').interceptors.spotify.init()
const { test } = require('cascade-test')

const { spotifyApi, refreshToken } = require('../../../../routes/shared/spotify')
const assert = require('assert')

const spotifySearchMock = require('fomoplayer_shared/interceptors/fixtures/spotify-search.json')

test({
  setup: async () => {
    await refreshToken()
    spotifyInterceptor.clearMockedRequests()
  },
  skip: () =>
    process.env.SPOTIFY_API_REDIRECT !== '' ||
    process.env.SPOTIFY_ACCOUNTS_REDIRECT !== '' ||
    process.env.SPOTIFY_CLIENT_ID !== '' ||
    process.env.SPOTIFY_CLIENT_SECRET !== ''
      ? 'Spotify redirects or credentials set'
      : undefined,
  'requests are intercepted': async () => {
    assert.equal(spotifyInterceptor.getMockedRequests().length, 0)
    const res = await spotifyApi.search('noisia', ['track', 'artist', 'album'], { limit: 10 })
    assert.equal(res.statusCode, 200)
    assert.equal(res.headers['content-type'], 'application/json')
    assert.equal(spotifyInterceptor.getMockedRequests().length, 1)
    assert.notEqual(
      spotifyInterceptor.getMockedRequests().find(({ url }) => new URL(url).pathname === '/v1/search/'),
      undefined,
    )
    assert.deepEqual(res.body, spotifySearchMock)
  },
  teardown: spotifyInterceptor.dispose
})

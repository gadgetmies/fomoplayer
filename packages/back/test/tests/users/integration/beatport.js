const spotifyInterceptor = require('fomoplayer_shared').interceptors.spotify.init() // required because of spotify client initialisation
const beatportInterceptor = require('fomoplayer_shared').interceptors.beatport.init()
const { test } = require('cascade-test')
const beatportLogic = require('../../../../routes/stores/beatport/logic')
const beatportSearch = require('../../../fixtures/beatport-search.json')
const assert = require('assert')

test({
  setup: () => {
    beatportInterceptor.clearMockedRequests()
  },
  skip: () =>
    process.env.BEATPORT_API_REDIRECT === '' && !process.env.BEATPORT_API_MOCK
      ? 'Beatport redirects set or mocks not set'
      : undefined,
  'requests are intercepted': async () => {
    const res = await beatportLogic.search('noisia')
    const requestedPaths = beatportInterceptor.getMockedRequests().map(({ url }) => new URL(url).pathname)
    assert.deepEqual([...requestedPaths].sort(), [
      '/v4/catalog/charts/',
      '/v4/catalog/playlists/',
      '/v4/catalog/search/',
    ])
    assert.deepEqual(res, beatportSearch)
  },
  teardown: async () => {
    spotifyInterceptor.dispose()
    beatportInterceptor.dispose()
  },
})

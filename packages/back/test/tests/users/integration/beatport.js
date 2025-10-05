const spotifyInterceptor = require('fomoplayer_shared').interceptors.spotify.init() // required because of spotify client initialisation
const beatportInterceptor = require('fomoplayer_shared').interceptors.beatport.init()
const { test } = require('cascade-test')
const beatportLogic = require('../../../../routes/stores/beatport/logic')
const beatportSearch = require('../../../fixtures/beatport-search.json')
const assert = require('assert')

test({
  setup: () => {},
  skip: () =>
    process.env.BEATPORT_API_REDIRECT === '' && !process.env.BEATPORT_API_MOCK
      ? 'Beatport redirects set or mocks not set'
      : undefined,
  'requests are intercepted': async () => {
    const res = await beatportLogic.search('noisia')
    assert.equal(beatportInterceptor.getMockedRequests().length, 2)
    assert.notEqual(
      beatportInterceptor.getMockedRequests().find(({ url }) => new URL(url).pathname === '/search/artists'),
      undefined,
    )
    assert.notEqual(
      beatportInterceptor.getMockedRequests().find(({ url }) => new URL(url).pathname === '/search/artists'),
      undefined,
    )
    assert.deepEqual(res, beatportSearch)
  },  
  teardown: async () => {
    spotifyInterceptor.dispose()
    beatportInterceptor.dispose()
  }
})

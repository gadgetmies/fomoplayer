const spotifyInterceptor = require('fomoplayer_shared').interceptors.spotify.init() // required because of spotify client initialisation
const beatportInterceptor = require('fomoplayer_shared').interceptors.beatport.init()
const { test } = require('cascade-test')
const beatportLogic = require('../../../../routes/stores/beatport/logic')
const beatportSearch = require('../../../fixtures/beatport-search.json')
const assert = require('assert')

const mockedPaths = () => beatportInterceptor.getMockedRequests().map(({ url }) => new URL(url).pathname)

test({
  setup: () => {
    beatportInterceptor.clearMockedRequests()
  },
  skip: () =>
    process.env.BEATPORT_API_REDIRECT === '' && !process.env.BEATPORT_API_MOCK
      ? 'Beatport redirects set or mocks not set'
      : undefined,
  'requests are intercepted': async () => {
    beatportInterceptor.clearMockedRequests()
    const res = await beatportLogic.search('noisia')
    const requestedPaths = mockedPaths()
    assert.deepEqual([...requestedPaths].sort(), ['/v4/catalog/search/'])
    assert.deepEqual(res, beatportSearch)
  },
  'artist search only hits the blended search endpoint': async () => {
    beatportInterceptor.clearMockedRequests()
    const res = await beatportLogic.search('noisia', 'artist')
    const requestedPaths = mockedPaths()
    assert.deepEqual(requestedPaths, ['/v4/catalog/search/'])
    assert.deepEqual(
      res,
      beatportSearch.filter(({ type }) => type === 'artist'),
    )
  },
  'label search only hits the blended search endpoint': async () => {
    beatportInterceptor.clearMockedRequests()
    const res = await beatportLogic.search('noisia', 'label')
    const requestedPaths = mockedPaths()
    assert.deepEqual(requestedPaths, ['/v4/catalog/search/'])
    assert.deepEqual(
      res,
      beatportSearch.filter(({ type }) => type === 'label'),
    )
  },
  'playlist search returns genre top-100 lists from the local cache without hitting the API': async () => {
    beatportInterceptor.clearMockedRequests()
    const res = await beatportLogic.search('techno', 'playlist')
    assert.deepEqual(mockedPaths(), [])
    assert.ok(res.length > 0, 'expected at least one genre top-100 result for "techno"')
    assert.ok(
      res.every(({ type, url }) => type === 'playlist' && /\/genre\/[^/]+\/\d+\/top-100$/.test(url)),
      'expected every playlist result to be a genre top-100 storefront URL',
    )
  },
  teardown: async () => {
    spotifyInterceptor.dispose()
    beatportInterceptor.dispose()
  },
})

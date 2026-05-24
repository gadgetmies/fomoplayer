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
    assert.deepEqual([...requestedPaths].sort(), ['/v4/catalog/playlists/', '/v4/catalog/search/'])
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
  'playlist search hits the playlists endpoint, not the blended search': async () => {
    beatportInterceptor.clearMockedRequests()
    const res = await beatportLogic.search('noisia', 'playlist')
    const requestedPaths = mockedPaths()
    assert.deepEqual([...requestedPaths].sort(), ['/v4/catalog/playlists/'])
    assert.deepEqual(
      res,
      beatportSearch.filter(({ type }) => type === 'playlist'),
    )
  },
  teardown: async () => {
    spotifyInterceptor.dispose()
    beatportInterceptor.dispose()
  },
})

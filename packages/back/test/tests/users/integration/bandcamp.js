const spotifyInterceptor = require('fomoplayer_shared').interceptors.spotify.init() // required because of spotify client initialisation
const bandcampInterceptor = require('fomoplayer_shared').interceptors.bandcamp.init()
const { test } = require('cascade-test')
const bandcampLogic = require('../../../../routes/stores/bandcamp/logic')
const bandcampSearchMapped = require('../../../fixtures/bandcamp-noisia-search-mapped.json')
const differentEyesTracks = require('../../../fixtures/bandcamp-different-eyes-tracks.json')
const f4kY00Tracks = require('../../../fixtures/bandcamp-f4k-y00-tracks.json')
const resonanceVTracks = require('../../../fixtures/bandcamp-resonance-v-tracks.json')
const resonanceVITracks = require('../../../fixtures/bandcamp-resonance-vi-tracks.json')
const assert = require('assert')

test({
  setup: () => {},
  skip: () =>
    process.env.BANDCAMP_API_REDIRECT === '' && !process.env.BANDCAMP_API_MOCK
      ? 'Bandcamp redirects set or mocks not set'
      : undefined,
  'search results': {
    skip: () => 'Interceptor does not catch the search request',
    'are mapped': async () => {
      const res = await bandcampLogic.search('noisia')
      assert.equal(bandcampInterceptor.getMockedRequests().length, 1)
      assert.notEqual(
        bandcampInterceptor
          .getMockedRequests()
          .find(({ url }) => new URL(url).pathname === '/api/bcsearch_public_api/1/autocomplete_elastic'),
        undefined,
      )
      assert.deepEqual(res, bandcampSearchMapped)
    },
    teardown: bandcampInterceptor.clearMockedRequests,
  },
  'artist tracks': {
    'are fetched': async () => {
      const noisiaUrl = 'https://noisia.bandcamp.com'
      const interceptedUrls = [
        'https://noisia.bandcamp.com/album/the-resonance-vi',
        'https://noisia.bandcamp.com/album/the-resonance-v',
      ]

      const expectedResults = [resonanceVTracks, resonanceVITracks]

      const generator = bandcampLogic.getArtistTracks({ url: noisiaUrl })
      let yields = 0
      for await (const { tracks, errors } of generator) {
        assert.equal(errors.length, 0)
        assert.equal(bandcampInterceptor.getMockedRequests().length, 2 + yields)
        assert.notEqual(
          bandcampInterceptor.getMockedRequests().find(({ url }) => url === interceptedUrls[yields]),
          undefined,
        )
        assert.deepEqual(tracks, expectedResults[yields])
        yields++
      }
      assert.notEqual(
        bandcampInterceptor.getMockedRequests().find(({ url }) => url === `${noisiaUrl}/music`),
        undefined,
      )
    },
    teardown: bandcampInterceptor.clearMockedRequests,
  },
  'label details': {
    'are fetched': async () => {
      const visionUrl = 'https://visionrecordings.bandcamp.com'
      const interceptedUrls = [
        'https://billainaethek.bandcamp.com/album/different-eyes-ep?label=4289352950&tab=music',
        'https://billainaethek.bandcamp.com/album/f4k-y00?label=4289352950&tab=music',
      ]

      const expectedResults = [differentEyesTracks, f4kY00Tracks]

      const generator = bandcampLogic.getLabelTracks({ url: visionUrl })
      let yields = 0
      for await (const { tracks, errors } of generator) {
        assert.equal(errors.length, 0)
        assert.equal(bandcampInterceptor.getMockedRequests().length, 2 + yields)
        assert.notEqual(
          bandcampInterceptor.getMockedRequests().find(({ url }) => url === interceptedUrls[yields]),
          undefined,
        )
        assert.deepEqual(tracks, expectedResults[yields])
        yields++
      }
      assert.notEqual(
        bandcampInterceptor.getMockedRequests().find(({ url }) => url === `${visionUrl}/music`),
        undefined,
      )
    },
    teardown: bandcampInterceptor.clearMockedRequests,
  },
  teardown: async () => {
    spotifyInterceptor.dispose()
    bandcampInterceptor.dispose()
  }
})

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
const tralbumDetailsUrl = 'https://bandcamp.com/api/mobile/24/tralbum_details'

test({
  setup: () => {
    bandcampInterceptor.clearMockedRequests()
  },
  skip: () =>
    process.env.BANDCAMP_API_REDIRECT === '' && !process.env.BANDCAMP_API_MOCK
      ? 'Bandcamp redirects set or mocks not set'
      : undefined,
  'search results': {
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
      // Release details come from the JSON endpoint, one POST per release,
      // carrying the item id read off the /music page tile.
      const interceptedIds = [3222376539 /* the-resonance-vi */, 1144765497 /* the-resonance-v */]

      const expectedResults = [resonanceVTracks, resonanceVITracks]

      const generator = bandcampLogic.getArtistTracks({ url: noisiaUrl })
      let yields = 0
      for await (const { tracks, errors } of generator) {
        // The generator yields a summary `{ tracks: [], errors: [] }` once
        // before the per-release stream so callers can surface skip-unchanged
        // counts; downstream consumers no-op on empty `tracks`. Skip it here.
        if (tracks.length === 0 && errors.length === 0) continue
        assert.equal(errors.length, 0)
        assert.equal(bandcampInterceptor.getMockedRequests().length, 2 + yields)
        assert.notEqual(
          bandcampInterceptor
            .getMockedRequests()
            .find(({ url, body }) => url === tralbumDetailsUrl && JSON.parse(body).tralbum_id === interceptedIds[yields]),
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
      const interceptedIds = [1051734106 /* different-eyes-ep */, 3959806045 /* f4k-y00 */]

      const expectedResults = [differentEyesTracks, f4kY00Tracks]

      const generator = bandcampLogic.getLabelTracks({ url: visionUrl })
      let yields = 0
      for await (const { tracks, errors } of generator) {
        if (tracks.length === 0 && errors.length === 0) continue
        assert.equal(errors.length, 0)
        assert.equal(bandcampInterceptor.getMockedRequests().length, 2 + yields)
        assert.notEqual(
          bandcampInterceptor
            .getMockedRequests()
            .find(({ url, body }) => url === tralbumDetailsUrl && JSON.parse(body).tralbum_id === interceptedIds[yields]),
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

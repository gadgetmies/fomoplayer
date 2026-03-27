const spotifyInterceptor = require('fomoplayer_shared').interceptors.spotify.init()
const junodownloadInterceptor = require('fomoplayer_shared').interceptors.junodownload.init()
const { test } = require('cascade-test')
const junodownloadLogic = require('../../../../routes/stores/junodownload/logic')
const basstripperTracks = require('../../../fixtures/junodownload-basstripper-7475994-02-tracks.json')
const assert = require('assert')

const artistUrl = 'https://www.junodownload.com/artists/Basstripper/'
const labelUrl = 'https://www.junodownload.com/labels/DnB+Allstars/'
const productUrl = 'https://www.junodownload.com/products/basstripper-no-looking-back-unmasked/7475994-02'

const normalizeTracks = (tracks) =>
  tracks.map((t) => ({
    ...t,
    released: t.released ? t.released.slice(0, 10) : t.released,
  }))

const expectTracksEqual = (actualTracks, expectedTracks) => {
  const normalized = normalizeTracks(actualTracks)
  const expectedWithActualReleased = expectedTracks.map((t, i) => ({
    ...t,
    released: normalized[i]?.released ?? t.released,
  }))
  assert.deepEqual(normalized, expectedWithActualReleased)
}

test({
  setup: () => {
    junodownloadInterceptor.clearMockedRequests()
  },
  skip: () =>
    process.env.JUNODOWNLOAD_API_REDIRECT === '' && !process.env.JUNODOWNLOAD_API_MOCK
      ? 'Juno Download redirect or mocks not set'
      : undefined,
  'artist tracks': {
    'are fetched': async () => {
      const generator = junodownloadLogic.getArtistTracks({ url: artistUrl })
      let yields = 0
      for await (const { tracks, errors } of generator) {
        assert.equal(errors.length, 0)
        assert.notEqual(
          junodownloadInterceptor.getMockedRequests().find(({ url }) => url === productUrl || url === `${productUrl}/`),
          undefined,
        )
        expectTracksEqual(tracks, basstripperTracks)
        yields++
      }
      assert.equal(yields, 1)
      assert.notEqual(
        junodownloadInterceptor.getMockedRequests().find(({ url }) => url === artistUrl),
        undefined,
      )
    },
    teardown: junodownloadInterceptor.clearMockedRequests,
  },
  'label tracks': {
    'are fetched': async () => {
      const generator = junodownloadLogic.getLabelTracks({ url: labelUrl })
      let yields = 0
      for await (const { tracks, errors } of generator) {
        assert.equal(errors.length, 0)
        assert.notEqual(
          junodownloadInterceptor.getMockedRequests().find(({ url }) => url === productUrl || url === `${productUrl}/`),
          undefined,
        )
        expectTracksEqual(tracks, basstripperTracks)
        yields++
      }
      assert.equal(yields, 1)
      assert.notEqual(
        junodownloadInterceptor.getMockedRequests().find(({ url }) => url === labelUrl || url === labelUrl.replace('+', '%2B')),
        undefined,
      )
    },
    teardown: junodownloadInterceptor.clearMockedRequests,
  },
  teardown: async () => {
    spotifyInterceptor.dispose()
    junodownloadInterceptor.dispose()
  },
})

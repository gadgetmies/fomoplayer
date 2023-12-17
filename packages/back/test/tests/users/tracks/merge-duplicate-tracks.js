require('fomoplayer_shared').interceptors.spotify.init()
const L = require('partial.lenses')
const R = require('ramda')
const { initDb, pg } = require('../../../lib/db.js')
const assert = require('assert')
const { test } = require('fomoplayer_shared').test.test
const { setupBeatportTracks, teardownTracks } = require('../../../lib/tracks.js')
const track = require('../../../fixtures/noisia_concussion_beatport.json')
const repl = require('repl')
const setMixName = version => L.modify(L.query('mix_name'), R.always(version))
const incrementTrackId = L.modify(L.query(['data', 'id']), R.inc)
const incrementReleaseId = L.modify(L.query(['release', 'id']), R.inc)
const replaceISRC = isrc => L.modify(L.query('isrc'), R.always(isrc))
const replaceCatalogNumber = catalogNumber => L.modify(L.query('catalog_number'), R.always(catalogNumber))
const trackWithSameISRC = R.pipe(incrementTrackId, incrementReleaseId, replaceCatalogNumber('VSN004'))(track)
const remixedTrack = R.pipe(
  incrementTrackId,
  incrementReleaseId,
  L.modify(
    L.query('remixers'),
    R.always([
      {
        id: 386795,
        name: 'Sigrah',
        slug: 'sigrah'
      }
    ])
  ),
  setMixName('Remix'),
  replaceISRC('NLCK40700054'),
  replaceCatalogNumber('VSN002')
)(track)

const editOfRemixedTrack = R.pipe(
  incrementTrackId,
  incrementReleaseId,
  setMixName('Edit'),
  replaceISRC('NLCK40700055'),
  replaceCatalogNumber('VSN003')
)(remixedTrack)

let count = 1
test({
  setup: async () => {
    await initDb()
  },
  'when duplicate tracks are added': {
    setup: async () => setupBeatportTracks([{ tracks: track }, { tracks: trackWithSameISRC }]),
    'only one track is added to db': async () => {
      const [{ trackCount }] = await pg.queryRowsAsync('select count(*) :: INT as "trackCount" from track')
      assert.strictEqual(trackCount, 1)
    },
    teardown: teardownTracks
  },
  'when remixed track is added': {
    setup: async () => setupBeatportTracks([{ tracks: track }, { tracks: remixedTrack }]),
    'both tracks are added to db': async () => {
      const [{ trackCount }] = await pg.queryRowsAsync('select count(*) :: INT as "trackCount" from track')
      assert.strictEqual(trackCount, 2)
    },
    teardown: teardownTracks
  },
  'when an edit of remixed track is added': {
    setup: async () => setupBeatportTracks([{ tracks: remixedTrack }, { tracks: editOfRemixedTrack }]),
    'both tracks are added to db': async () => {
      const [{ trackCount }] = await pg.queryRowsAsync('select count(*) :: INT as "trackCount" from track')
      assert.strictEqual(trackCount, 2)
    },
    teardown: teardownTracks
  }
})

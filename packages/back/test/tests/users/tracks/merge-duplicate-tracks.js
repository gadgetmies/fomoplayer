const L = require('partial.lenses')
const R = require('ramda')
const sql = require('sql-template-strings')
const { initDb, pg } = require('../../../lib/db.js')
const assert = require('assert')
const { test } = require('../../../lib/test.js')
const { addNewBeatportTracksToDb, setupTracks, teardownTracks } = require('../../../lib/tracks.js')
const track = require('../../../fixtures/monty_track.json')
const { removeSources } = require('../../../lib/sources')
const modifiedTrack = L.modify(L.seq(['id'], ['release', 'id']), R.inc, track)
const remixedTrack = R.pipe(
  L.modify(L.seq(['id'], ['release', 'id']), R.inc),
  R.flip(R.merge)({
    mix: 'Remix',
    remixers: [
      {
        id: 386795,
        name: 'Sigrah',
        slug: 'sigrah'
      }
    ]
  })
)(track)
const editOfRemixedTrack = R.pipe(L.modify(L.seq(['id'], ['release', 'id']), R.inc), L.set('mix', 'Edit'))(remixedTrack)

let count = 1
test({
  setup: async () => {
    await initDb()
  },
  'when duplicate tracks are added': {
    setup: async () => setupTracks({ tracks: [track] }, { tracks: [modifiedTrack] }),
    'only one track is added to db': async () => {
      const [{ trackCount }] = await pg.queryRowsAsync('select count(*) :: INT as "trackCount" from track')
      assert.strictEqual(trackCount, 1)
    },
    teardown: teardownTracks
  },
  'when remixed track is added': {
    setup: async () => setupTracks({ tracks: [track] }, { tracks: [remixedTrack] }),
    'only both tracks are added to db': async () => {
      const [{ trackCount }] = await pg.queryRowsAsync('select count(*) :: INT as "trackCount" from track')
      assert.strictEqual(trackCount, 2)
    },
    teardown: teardownTracks
  },
  'when an edit of remixed track is added': {
    setup: async () => setupTracks({ tracks: [remixedTrack] }, { tracks: [editOfRemixedTrack] }),
    'only both tracks are added to db': async () => {
      const [{ trackCount }] = await pg.queryRowsAsync('select count(*) :: INT as "trackCount" from track')
      assert.strictEqual(trackCount, 2)
    },
    teardown: teardownTracks
  }
})

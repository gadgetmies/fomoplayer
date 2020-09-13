const L = require('partial.lenses')
const R = require('ramda')
const { using } = require('bluebird')
const pg = require('../../db/pg.js')

const db = require('../include/db.js')
const track = require('./fixtures/hoogs_track.json')
const bpLogic = require('../../routes/stores/beatport/logic.js')
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
const editOfRemixedTrack = R.pipe(
  L.modify(L.seq(['id'], ['release', 'id']), R.inc),
  L.set('mix', 'Edit')
)(remixedTrack)
const assert = require('assert')
const { test } = require('../lib/test.js')

test({
  'when duplicate artists are added': {
    setup: async () => {
      await db.initDb()
      await using(pg.getTransaction(), tx => bpLogic.test.insertNewTracksToDb(tx, [track]))
      return await using(pg.getTransaction(), tx => bpLogic.test.insertNewTracksToDb(tx, [modifiedTrack]))
    },
    'only one track is added to db': async () => {
      const { trackCount } = (await pg.queryAsync('select count(*) as "trackCount" from track'))[0]
      assert.equal(trackCount, 1)
    },
    teardown: async () => {
      // await db.initDb()
    }
  },
  'when remixed track is added': {
    setup: async () => {
      await db.initDb()
      await using(pg.getTransaction(), tx => bpLogic.test.insertNewTracksToDb(tx, [remixedTrack]))
      return await using(pg.getTransaction(), tx => bpLogic.test.insertNewTracksToDb(tx, [track]))
    },
    'only one track is added to db': async () => {
      const { trackCount } = (await pg.queryAsync('select count(*) as "trackCount" from track'))[0]
      assert.equal(trackCount, 2)
    },
    teardown: async () => {
      // await db.initDb()
    }
  },
  'when an edit of remixed track is added': {
    setup: async () => {
      await db.initDb()
      await using(pg.getTransaction(), tx => bpLogic.test.insertNewTracksToDb(tx, [remixedTrack]))
      return await using(pg.getTransaction(), tx => bpLogic.test.insertNewTracksToDb(tx, [editOfRemixedTrack]))
    },
    'only one track is added to db': async () => {
      const { trackCount } = (await pg.queryAsync('select count(*) as "trackCount" from track'))[0]
      assert.equal(trackCount, 2)
    },
    teardown: async () => {
      // await db.initDb()
    }
  }
})

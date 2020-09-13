const L = require('partial.lenses')
const R = require('ramda')
const { using } = require('bluebird')
const pg = require('../../db/pg.js')

const db = require('../include/db.js')
const firstTrack = require('./fixtures/hoogs_track.json')
const secondTrack = require('./fixtures/another_hoogs_track.json')
const bpLogic = require('../../routes/stores/beatport/logic.js')
const tracks = [firstTrack, secondTrack]
const assert = require('assert')
const { test } = require('../lib/test.js')

test({
  'when duplicate artists are added': {
    setup: async () => {
      await db.initDb()
      return await using(pg.getTransaction(), tx => bpLogic.test.insertNewTracksToDb(tx, tracks))
    },
    'only one artist is added to db': async () => {
      const { artistCount } = (await pg.queryAsync('select count(*) as "artistCount" from artist'))[0]
      assert.equal(artistCount, 1)
    },
    teardown: async () => {
      // await db.initDb()
    }
  }
})

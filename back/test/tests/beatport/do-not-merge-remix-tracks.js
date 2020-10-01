const L = require('partial.lenses')
const R = require('ramda')
const { using } = require('bluebird')
const { initDb, pg } = require('../../lib/db.js')

const tracks = require('../../fixtures/track_and_remix.json')
const bpLogic = require('../../../routes/stores/beatport/logic.js')
const assert = require('assert')
const { test } = require('../../lib/test.js')

test({
  'when track and a remix is added': {
    setup: async () => {
      await initDb()
      return await using(pg.getTransaction(), tx => bpLogic.test.insertNewTracksToDb(tx, tracks))
    },
    'two tracks are added': async () => {
      const { trackCount } = (await pg.queryAsync('select count(*) as "trackCount" from track'))[0]
      assert.equal(trackCount, 2)
    },
    teardown: async () => {
      // await db.initDb()
    }
  }
})

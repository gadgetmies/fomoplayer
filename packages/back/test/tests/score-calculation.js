const L = require('partial.lenses')
const R = require('ramda')
const { using, delay } = require('bluebird')
const { initDb, pg } = require('../lib/db.js')
const sql = require('sql-template-strings')
const tracks = require('../fixtures/track_and_remix.json')
const bpLogic = require('../../routes/stores/beatport/logic.js')
const { queryUserTracks } = require('../../routes/logic.js')
const assert = require('assert')
const { test } = require('../lib/test.js')

const username = 'testuser'

test({
  'when track and a remix is added': {
    setup: async () => {
      await initDb()
      await using(pg.getTransaction(), tx => bpLogic.test.insertNewTracksToDb(tx, tracks))
      await bpLogic.test.insertDownloadedTracksToUser(username, tracks)
    },
    'two tracks are added': async () => {
      const { trackCount } = (await pg.queryAsync('select count(*) as "trackCount" from track'))[0]
      assert.equal(trackCount, 2)
    },
    'correct score is returned': async () => {
      const tracks = await queryUserTracks(username)
      assert.equal(tracks, [])
    },
    teardown: async () => {
      // await db.initDb()
    }
  }
})

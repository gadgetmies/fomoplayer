const { initDb, pg } = require('../lib/db.js')
const { using } = require('bluebird')
const tracks = require('../fixtures/track_and_remix.json')
const bpLogic = require('../../routes/stores/beatport/logic.js')
const { getUserTracks } = require('../../routes/users/logic.js')
const assert = require('assert')
const { test } = require('../lib/test.js')

const userId = 1

test({
  'when track and a remix is added': {
    setup: async () => {
      await initDb()
      await using(pg.getTransaction(), tx => bpLogic.test.insertNewTracksToDb(tx, tracks))
      await bpLogic.test.insertDownloadedTracksToUser(userId, tracks)
    },
    'two tracks are added': async () => {
      const [{ trackCount }] = await pg.queryRowsAsync('select count(*) as "trackCount" from track')
      assert.equal(trackCount, 2)
    },
    'correct score is returned': async () => {
      const tracks = await getUserTracks(userId)
      assert.equal(tracks, [])
    },
    teardown: async () => {
      // await db.initDb()
    }
  }
})

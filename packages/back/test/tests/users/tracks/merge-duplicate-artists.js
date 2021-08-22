const { initDb, pg } = require('../../../lib/db.js')
const firstTrack = require('../../../fixtures/monty_track.json')
const secondTrack = require('../../../fixtures/another_monty_track.json')
const tracks = [firstTrack, secondTrack]
const assert = require('assert')
const { test } = require('../../../lib/test.js')
const { addNewBeatportTracksToDb } = require('../../../lib/tracks.js')

test({
  'when duplicate artists are added': {
    setup: async () => {
      await initDb()
      await addNewBeatportTracksToDb(tracks)
    },
    'only one artist is added to db': async () => {
      const [{ artistCount }] = await pg.queryRowsAsync('select count(*) :: INT as "artistCount" from artist')
      assert.strictEqual(artistCount, 1)
    },
    teardown: async () => {
      // await db.initDb()
    }
  }
})

const { initDb, pg } = require('../../../lib/db.js')
const firstTrack = require('../../../fixtures/monty_track.json')
const secondTrack = require('../../../fixtures/another_monty_track.json')
const tracks = [firstTrack, secondTrack]
const assert = require('assert')
const { setupTracks, teardownTracks } = require('../../../lib/tracks')
const { test } = require('../../../lib/test.js')

test({
  setup: async () => {
    await initDb()
  },
  'when duplicate artists are added': {
    setup: async () => setupTracks({ tracks }),
    'only one artist is added to db': async () => {
      const [{ artistCount }] = await pg.queryRowsAsync('select count(*) :: INT as "artistCount" from artist')
      assert.strictEqual(artistCount, 1)
    },
    teardown: teardownTracks
  }
})

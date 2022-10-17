const { initDb, pg } = require('../../../lib/db.js')
const tracks = require('../../../fixtures/track_and_remix.json')
const assert = require('assert')
const { test } = require('../../../lib/test.js')
const { setupTracks, teardownTracks } = require('../../../lib/tracks.js')

test({
  setup: async () => {
    await initDb()
  },
  'when track and a remix is added': {
    setup: async () => setupTracks({ tracks }),
    'two tracks are added': async () => {
      const [{ trackCount }] = await pg.queryRowsAsync('select count(*) as "trackCount" from track')
      assert.equal(trackCount, 2)
    },
    teardown: teardownTracks
  }
})

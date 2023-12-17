require('fomoplayer_shared').interceptors.spotify.init()
const { initDb, pg } = require('../../../lib/db.js')
const firstTrack = require('../../../fixtures/noisia_purpose_beatport.json')
const secondTrack = require('../../../fixtures/noisia_purpose_remix_beatport.json')
const assert = require('assert')
const { test } = require('fomoplayer_shared').test.test
const { setupBeatportTracks, teardownTracks } = require('../../../lib/tracks.js')

test({
  setup: async () => {
    await initDb()
  },
  'when track and a remix is added': {
    setup: async () => setupBeatportTracks([{ tracks: firstTrack }, { tracks: secondTrack }]),
    'two tracks are added': async () => {
      const [{ trackCount }] = await pg.queryRowsAsync('select count(*) as "trackCount" from track')
      assert.equal(trackCount, 2)
    },
    teardown: teardownTracks
  }
})

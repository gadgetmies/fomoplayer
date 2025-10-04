const spotifyInterceptor = require('fomoplayer_shared').interceptors.spotify.init()
const { initDb, pg } = require('../../../lib/db.js')
const firstTrack = require('../../../fixtures/noisia_concussion_beatport.json')
const secondTrack = require('../../../fixtures/noisia_purpose_beatport.json')
const assert = require('assert')
const { setupBeatportTracks, teardownTracks } = require('../../../lib/tracks')
const { test } = require('fomoplayer_shared').test.test

test({
  setup: async () => {
    await initDb()
  },
  'when duplicate artists are added': {
    setup: async () => setupBeatportTracks([{ tracks: firstTrack }, { tracks: secondTrack }]),
    'only one artist is added to db': async () => {
      const [{ artistCount }] = await pg.queryRowsAsync('select count(*) :: INT as "artistCount" from artist')
      assert.strictEqual(artistCount, 1)
    },
    teardown: teardownTracks,
  },
  teardown: async () => {
    spotifyInterceptor.dispose()
  }
})

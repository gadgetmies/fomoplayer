require('fomoplayer_shared').interceptors.spotify.init()
const R = require('ramda')
const { initDb, pg } = require('../../../lib/db.js')
const track = require('../../../fixtures/noisia_concussion_spotify.json')
const assert = require('assert')
const { teardownTracks, addNewSpotifyTracksToDb } = require('../../../lib/tracks')
const { updateDates } = require('../../../lib/fixture-utils')
const { test } = require('fomoplayer_shared').test.test
const expectedTrackDetails = require('../../../fixtures/spotify_track_details.json')

const userId = 1

const trackWithUpdatedDates = updateDates()(track)
test({
  setup: async () => {
    await initDb()
  },
  'when a track is added': {
    setup: async () => addNewSpotifyTracksToDb([trackWithUpdatedDates]),
    'track is added to user': async () => {
      const [{ trackCount }] = await pg.queryRowsAsync('SELECT COUNT(*) :: INT AS "trackCount" FROM user__track')
      return assert.strictEqual(trackCount, 1)
    },
    'track details are mapped correctly': async () => {
      const [{ track_details: actualTrackDetails }] = await pg.queryRowsAsync('SELECT track_details FROM track_details')

      const actual = R.omit(['added', 'released', 'published', 'source_details'], actualTrackDetails)
      return assert.deepEqual(actual, expectedTrackDetails)
    },
    teardown: teardownTracks,
  },
})

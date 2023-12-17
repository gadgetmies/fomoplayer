require('fomoplayer_shared').interceptors.spotify.init()
const { initDb, pg } = require('../../../lib/db.js')
const firstTrack = require('../../../fixtures/noisia_concussion_beatport.json')
const assert = require('assert')
const { setupBeatportTracks, teardownTracks } = require('../../../lib/tracks')
const { updateDates } = require('../../../lib/fixture-utils')
const { test } = require('fomoplayer_shared').test.test

const { addArtistsOnLabelsToIgnore, removeArtistsOnLabelsIgnores } = require('../../../../routes/users/logic.js')

const userId = 1

const tracksWithUpdatedDates = updateDates()(firstTrack)
test({
  setup: async () => {
    await initDb()
  },
  'when a track is added': {
    setup: async () => setupBeatportTracks([{ tracks: tracksWithUpdatedDates }]),
    'track is added to user': async () => {
      const [{ trackCount }] = await pg.queryRowsAsync('select count(*) :: INT as "trackCount" from user__track')
      return assert.strictEqual(trackCount, 1)
    },
    'when artists on labels are added to ignore': {
      setup: async () => ({ ignoreIds: await addArtistsOnLabelsToIgnore(userId, { artistIds: [1], labelIds: [1] }) }),
      teardown: async ({ ignoreIds }) => removeArtistsOnLabelsIgnores(ignoreIds),
      'user tracks are removed': async () => {
        const [{ trackCount }] = await pg.queryRowsAsync('select count(*) :: INT as "trackCount" from user__track')
        assert.strictEqual(trackCount, 0)
      },
      'when the track is re-added': {
        setup: async () => setupBeatportTracks([{ tracks: tracksWithUpdatedDates }]),
        'tracks are not added for the user': async () => {
          const [{ trackCount }] = await pg.queryRowsAsync('select count(*) :: INT as "trackCount" from user__track')
          assert.strictEqual(trackCount, 0)
        }
      }
      // TODO: when another track from the same artist on the same label is added
    },
    teardown: teardownTracks
  }
})

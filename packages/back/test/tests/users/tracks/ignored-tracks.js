const { initDb, pg } = require('../../../lib/db.js')
const firstTrack = require('../../../fixtures/monty_track.json')
const assert = require('assert')
const { test } = require('../../../lib/test.js')
const { beatportTracksTransform } = require('../../../../../chrome-extension/src/js/transforms/beatport.js')
const { addTracks } = require('../../../lib/tracks.js')
const userId = 1
const transformedTracks = beatportTracksTransform([firstTrack])
const { addArtistsOnLabelsToIgnore } = require('../../../../routes/users/logic.js')

test({
  'when a track is added': {
    setup: async () => {
      await initDb()
      await addTracks(transformedTracks)
    },
    'track is added to user': async () => {
      const [{ trackCount }] = await pg.queryRowsAsync('select count(*) :: INT as "trackCount" from user__track')
      assert.strictEqual(trackCount, 1)
    },
    'when artists on labels are added to ignore': {
      setup: async () => {
        return await addArtistsOnLabelsToIgnore(userId, { artistIds: [1], labelIds: [1] })
      },
      'user tracks are removed': async () => {
        const [{ trackCount }] = await pg.queryRowsAsync('select count(*) :: INT as "trackCount" from user__track')
        assert.strictEqual(trackCount, 0)
      },
      'when the track is re-added': {
        setup: async () => {
          await addTracks(transformedTracks)
        },
        'tracks are not added for the user': async () => {
          const [{ trackCount }] = await pg.queryRowsAsync('select count(*) :: INT as "trackCount" from user__track')
          assert.strictEqual(trackCount, 0)
        }
      }
      // TODO: when another track from the same artist on the same label is added
    },
    teardown: async () => {
      // await db.initDb()
    }
  }
})

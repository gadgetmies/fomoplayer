require('../../../lib/spotifyInterceptor').init()
const L = require('partial.lenses')
const { initDb, pg } = require('../../../lib/db.js')
const { getUserTracks } = require('../../../../routes/users/logic.js')
const assert = require('assert')
const { test } = require('../../../lib/test.js')
const beatportLibrary = require('../../../fixtures/my-beatport.json')
const firstTrack = require('../../../fixtures/noisia_concussion_beatport.json')
const secondTrack = require('../../../fixtures/noisia_purpose_beatport.json')
const scoreDetails = require('../../../fixtures/score-details.json')
const { updateDates } = require('../../../lib/fixture-utils')
const { addNewBeatportTracksToDb, addPurchasedBeatportTracksToDb } = require('../../../lib/tracks.js')
const {
  updateDateReleasedScore,
  updateDatePublishedScore,
  updateDateAddedScore,
  updatePurchasedScores
} = require('../../../../jobs/scores')
const { setupBeatportTracks } = require('../../../lib/tracks')

const userId = 1

test({
  'when track and a remix is added': {
    setup: async () => {
      const updateDatesToToday = updateDates()
      await initDb()
      await addPurchasedBeatportTracksToDb(updateDatesToToday(beatportLibrary))
      await addNewBeatportTracksToDb(updateDatesToToday(firstTrack))
      await addNewBeatportTracksToDb(updateDatesToToday(secondTrack))
      await updateDateReleasedScore()
      await updateDatePublishedScore()
      await updateDateAddedScore()
      await updatePurchasedScores()
    },
    'two tracks are added': async () => {
      const [{ trackCount }] = await pg.queryRowsAsync('select count(*) :: INT as "trackCount" from track')
      assert.strictEqual(trackCount, 3)
    },
    'correct score is returned': async () => {
      const tracks = await getUserTracks(userId)
      const actualScoreDetails = L.collect([L.query(L.props('score_details'), L.flat(L.values))], tracks.tracks.new)
      assert.deepStrictEqual(actualScoreDetails, scoreDetails)
    },
    teardown: async () => {
      // await db.initDb()
    }
  }
})

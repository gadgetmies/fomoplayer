const L = require('partial.lenses')
const { initDb, pg } = require('../../../lib/db.js')
const { getUserTracks } = require('../../../../routes/users/logic.js')
const assert = require('assert')
const { test } = require('../../../lib/test.js')
const myBeatport = require('../../../fixtures/my-beatport.json')
const beatportTracks = require('../../../fixtures/beatport-tracks.json')
const libraryTracks = myBeatport.results
const newTracks = beatportTracks
const scoreDetails = require('../../../fixtures/score-details.json')
const { updateDates } = require('../../../lib/fixture-utils')
const { addNewBeatportTracksToDb, addPurchasedBeatportTracksToDb } = require('../../../lib/tracks.js')
const {
  updateDateReleasedScore,
  updateDatePublishedScore,
  updateDateAddedScore,
  updatePurchasedScores
} = require('../../../../jobs/scores')

const userId = 1

test({
  'when track and a remix is added': {
    setup: async () => {
      const updateDatesToToday = updateDates()
      await initDb()
      await addPurchasedBeatportTracksToDb(updateDatesToToday(libraryTracks))
      await addNewBeatportTracksToDb(updateDatesToToday(newTracks))
      await updateDateReleasedScore()
      await updateDatePublishedScore()
      await updateDateAddedScore()
      await updatePurchasedScores()
    },
    'two tracks are added': async () => {
      const [{ trackCount }] = await pg.queryRowsAsync('select count(*) :: INT as "trackCount" from track')
      assert.strictEqual(trackCount, 4)
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

const assert = require('assert')
const { test } = require('cascade-test')
const sql = require('sql-template-strings')
const { initDb, pg } = require('../../lib/db.js')
const { addNewBeatportTracksToDb } = require('../../lib/tracks.js')
const { resolveTestUserId } = require('../../lib/test-user')
const { updateTrackDetails } = require('../../../jobs/track_details')
const trackFixture = require('../../fixtures/noisia_block_control_beatport.json')

const rawTrack = trackFixture.pageProps.dehydratedState.queries[0].state.data

const queryTrackId = async () =>
  (
    await pg.queryRowsAsync(
      sql`SELECT track_id AS "trackId" FROM store__track WHERE store__track_store_id = ${String(rawTrack.id)}`,
    )
  )[0].trackId

const queryDetailsTitle = async (trackId) =>
  (await pg.queryRowsAsync(sql`SELECT track_details->>'title' AS title FROM track_details WHERE track_id = ${trackId}`))[0]
    ?.title

test({
  setup: async () => {
    await initDb()
    const userId = await resolveTestUserId()
    await addNewBeatportTracksToDb(trackFixture, false, [userId])
    const trackId = await queryTrackId()
    // Tracks stored before track_details existed never got a row
    await pg.queryAsync(sql`DELETE FROM track_details WHERE track_id = ${trackId}`)
    // A track the details function cannot build a row for (no store track, preview or author)
    const [{ orphanTrackId }] = await pg.queryRowsAsync(
      sql`INSERT INTO track (track_title) VALUES ('Orphan') RETURNING track_id AS "orphanTrackId"`,
    )
    return { trackId, orphanTrackId }
  },

  'creates the missing track_details row': async ({ trackId }) => {
    assert.strictEqual(await queryDetailsTitle(trackId), undefined)
    await updateTrackDetails()
    assert.strictEqual(await queryDetailsTitle(trackId), rawTrack.name)
  },

  'skips tracks the details function cannot build': async ({ orphanTrackId }) => {
    await updateTrackDetails()
    assert.strictEqual(await queryDetailsTitle(orphanTrackId), undefined)
  },

  'still refreshes stale rows': async ({ trackId }) => {
    await pg.queryAsync(sql`
UPDATE track_details
SET track_details = '{"title": "stale"}', track_details_updated = NOW() - INTERVAL '8 days'
WHERE track_id = ${trackId}`)
    await updateTrackDetails()
    assert.strictEqual(await queryDetailsTitle(trackId), rawTrack.name)
  },

  teardown: async () => {
    await initDb()
  },
})

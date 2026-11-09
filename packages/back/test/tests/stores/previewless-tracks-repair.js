const assert = require('assert')
const { test } = require('cascade-test')
const sql = require('sql-template-strings')
const { initDb, pg } = require('../../lib/db.js')
const { addBandcampTracks } = require('../../lib/tracks.js')
const { resolveTestUserId } = require('../../lib/test-user')
const { repairPreviewlessTracks } = require('../../../scripts/repair-previewless-tracks')
const resonanceVITracks = require('../../fixtures/bandcamp-resonance-vi-tracks.json')

const storeTrackIdOf = (title) => String(resonanceVITracks.find((track) => track.title === title).id)
const streamed = storeTrackIdOf('Anomaly')
const notStreamed = storeTrackIdOf('Banshee')
const notStreamedInCart = storeTrackIdOf('Crank')
const untouched = storeTrackIdOf('Halcyon')

// The release page as getRelease returns it: Banshee and Crank are no longer streamed
const release = async () => ({
  trackinfo: resonanceVITracks
    .map(({ store_details }) => store_details)
    .filter(({ id }) => ![notStreamed, notStreamedInCart].includes(String(id))),
})

const queryTrackId = async (storeTrackId) =>
  (
    await pg.queryRowsAsync(
      sql`SELECT track_id AS "trackId" FROM store__track WHERE store__track_store_id = ${storeTrackId}`,
    )
  )[0]?.trackId

const queryPreviews = (storeTrackId) =>
  pg.queryRowsAsync(sql`
SELECT store__track_preview_url AS url, store__track_preview_start_ms AS "startMs", store__track_preview_end_ms AS "endMs"
FROM store__track_preview NATURAL JOIN store__track WHERE store__track_store_id = ${storeTrackId}`)

const queryHasDetails = async (trackId) =>
  (await pg.queryRowsAsync(sql`SELECT 1 FROM track_details WHERE track_id = ${trackId}`)).length > 0

// What the 2020-21 Bandcamp tracks look like: no preview and no track_details row
const removePreviews = async (storeTrackIds) => {
  await pg.queryAsync(sql`
DELETE FROM store__track_preview
WHERE store__track_id IN (SELECT store__track_id FROM store__track WHERE store__track_store_id = ANY (${storeTrackIds}))`)
  await pg.queryAsync(sql`
DELETE FROM track_details
WHERE track_id IN (SELECT track_id FROM store__track WHERE store__track_store_id = ANY (${storeTrackIds}))`)
}

// A track whose store track is gone
const insertOrphan = async () =>
  (await pg.queryRowsAsync(sql`INSERT INTO track (track_title) VALUES ('Orphan') RETURNING track_id AS "trackId"`))[0]
    .trackId

const silent = () => {}

test({
  setup: async () => {
    await initDb()
    const userId = await resolveTestUserId()
    await addBandcampTracks(resonanceVITracks, [userId])
    await removePreviews([streamed, notStreamed, notStreamedInCart])
    const [{ cartId }] = await pg.queryRowsAsync(
      sql`INSERT INTO cart (cart_name, meta_account_user_id) VALUES ('Keep', ${userId}) RETURNING cart_id AS "cartId"`,
    )
    await pg.queryAsync(
      sql`INSERT INTO track__cart (cart_id, track_id) VALUES (${cartId}, ${await queryTrackId(notStreamedInCart)})`,
    )
  },

  'a dry run and a rate limit change nothing': async () => {
    const orphanTrackId = await insertOrphan()
    const summary = await repairPreviewlessTracks({ getRelease: release, log: silent })
    assert.deepStrictEqual(
      { restored: summary.restored, deleted: summary.deleted, keptInCart: summary.keptInCart },
      { restored: 1, deleted: 2, keptInCart: 1 },
    )

    const rateLimited = await repairPreviewlessTracks({
      apply: true,
      getRelease: async () => {
        throw Object.assign(new Error('Too many requests'), { isRateLimit: true })
      },
      log: silent,
    })
    assert.strictEqual(rateLimited.rateLimited, true)
    assert.deepStrictEqual(await queryPreviews(streamed), [])
    assert.ok(await queryTrackId(notStreamed))
    assert.ok((await pg.queryRowsAsync(sql`SELECT 1 FROM track WHERE track_id = ${orphanTrackId}`)).length === 1)
  },

  'leaves tracks alone when their release cannot be checked': async () => {
    const summary = await repairPreviewlessTracks({
      apply: true,
      getRelease: async () => {
        throw Object.assign(new Error('Server error'), { statusCode: 503 })
      },
      log: silent,
    })
    assert.strictEqual(summary.unknown.length, 3)
    assert.ok(await queryTrackId(notStreamed))
  },

  'restores streamed previews and deletes unfixable tracks that are in no cart': async () => {
    const orphanTrackId = await insertOrphan()
    await repairPreviewlessTracks({ apply: true, getRelease: release, log: silent })

    const anomaly = resonanceVITracks.find(({ title }) => title === 'Anomaly')
    assert.deepStrictEqual(await queryPreviews(streamed), [{ url: null, startMs: 0, endMs: anomaly.duration_ms }])
    assert.ok(await queryHasDetails(await queryTrackId(streamed)))

    assert.strictEqual(await queryTrackId(notStreamed), undefined)
    assert.deepStrictEqual(await pg.queryRowsAsync(sql`SELECT 1 FROM track WHERE track_id = ${orphanTrackId}`), [])
    assert.ok(await queryTrackId(notStreamedInCart))
    assert.ok(await queryTrackId(untouched))
  },

  teardown: async () => {
    // Label-page artists have no store id, which the schema reset's down migrations do not allow
    await pg.queryAsync(sql`DELETE FROM store__artist WHERE store__artist_store_id IS NULL`)
    await initDb()
  },
})

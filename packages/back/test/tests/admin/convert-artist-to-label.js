const assert = require('assert')
const { test } = require('cascade-test')
const sql = require('sql-template-strings')
const { initDb, pg } = require('../../lib/db.js')
const { addBandcampTracks } = require('../../lib/tracks.js')
const { resolveTestUserId } = require('../../lib/test-user')
const { convertArtistToLabelAndQueueRefetch } = require('../../../routes/admin/db')
const resonanceVITracks = require('../../fixtures/bandcamp-resonance-vi-tracks.json')

test({
  setup: async () => {
    await initDb()
    await addBandcampTracks(resonanceVITracks, [await resolveTestUserId()])
    const [{ artistId }] = await pg.queryRowsAsync(
      sql`SELECT artist_id AS "artistId" FROM store__artist WHERE store__artist_url = 'https://noisia.bandcamp.com'`,
    )
    return { artistId }
  },

  'queues the label re-fetch that re-credits the converted artist’s tracks': async ({ artistId }) => {
    const { labelId, labelRefetchQueued } = await convertArtistToLabelAndQueueRefetch(artistId)
    assert.strictEqual(labelRefetchQueued, true)
    const queued = await pg.queryRowsAsync(sql`
SELECT bandcamp_label_artist_refetch_status AS status FROM bandcamp_label_artist_refetch WHERE label_id = ${labelId}`)
    assert.deepStrictEqual(queued, [{ status: 'pending' }])
  },

  teardown: async () => {
    // Label-page artists have no store id, which the schema reset's down migrations do not allow
    await pg.queryAsync(sql`DELETE FROM store__artist WHERE store__artist_store_id IS NULL`)
    await initDb()
  },
})

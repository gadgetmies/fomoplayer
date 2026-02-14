const { initDb, pg } = require('../../lib/db.js')
const assert = require('assert')
const { test } = require('cascade-test')
const sql = require('sql-template-strings')

test({
  setup: async () => {
    await initDb()
  },
  'merge_tracks logic': {
    setup: async () => {
      // Create two tracks
      const [{ track_id: id1 }] = await pg.queryRowsAsync(sql`INSERT INTO track (track_title) VALUES ('Track 1') RETURNING track_id`)
      const [{ track_id: id2 }] = await pg.queryRowsAsync(sql`INSERT INTO track (track_title) VALUES ('Track 2') RETURNING track_id`)

      // Add store__track to both
      await pg.queryAsync(sql`INSERT INTO store__track (track_id, store_id, store__track_store_id, store__track_store_details) VALUES (${id1}, 1, 's1', '{}')`)
      await pg.queryAsync(sql`INSERT INTO store__track (track_id, store_id, store__track_store_id, store__track_store_details) VALUES (${id2}, 1, 's2', '{}')`)

      return { id1, id2 }
    },
    'merges two tracks into one': async ({ id1, id2 }) => {
      await pg.queryAsync(sql`SELECT merge_tracks(${id1}, ${id2})`)

      const tracks = await pg.queryRowsAsync(sql`SELECT * FROM track WHERE track_id IN (${id1}, ${id2})`)
      assert.strictEqual(tracks.length, 1)
      assert.strictEqual(tracks[0].track_id, id1)

      const storeTracks = await pg.queryRowsAsync(sql`SELECT * FROM store__track WHERE track_id = ${id1}`)
      assert.strictEqual(storeTracks.length, 2)
    }
  }
})

const assert = require('assert')
const { test } = require('cascade-test')
const sql = require('sql-template-strings')
const pg = require('fomoplayer_shared').db.pg

const { initDb } = require('../../lib/db')
const { queryEntityDetails } = require('../../../routes/shared/db/entities')

// The follow popup lists every store row returned by /artists/:id, but the
// follows it compares against are filtered by the requested stores. A store
// outside that filter (e.g. Spotify on a Beatport+Bandcamp frontend) could be
// followed but would never show as followed, so the details must apply the
// same filter.
const ARTIST_NAME = 'entity-details store filter fixture'

test({
  setup: async () => {
    await initDb()
    const [{ artist_id: artistId }] = await pg.queryRowsAsync(
      sql`INSERT INTO artist (artist_name) VALUES (${ARTIST_NAME}) RETURNING artist_id`,
    )
    await pg.queryAsync(sql`
      INSERT INTO store__artist (store__artist_store_id, store__artist_url, store_id, artist_id)
      SELECT v.store_id_value, v.url, store_id, ${artistId}
      FROM store
        JOIN (VALUES ('Bandcamp', 'https://entity-details-fixture', 'https://entity-details-fixture.bandcamp.com'),
                     ('Spotify', 'entityDetailsFixture', 'https://open.spotify.com/artist/entityDetailsFixture'))
          AS v(store_name, store_id_value, url) USING (store_name)
    `)
    return { artistId }
  },
  'without a store filter returns all stores': async ({ artistId }) => {
    const details = await queryEntityDetails('artist', artistId)
    assert.deepStrictEqual(details.stores.map(({ store: { name } }) => name).sort(), ['Bandcamp', 'Spotify'])
  },
  'with a store filter returns only the requested stores': async ({ artistId }) => {
    const details = await queryEntityDetails('artist', artistId, ['beatport', 'bandcamp'])
    assert.strictEqual(details.name, ARTIST_NAME)
    assert.deepStrictEqual(
      details.stores.map(({ store: { name } }) => name),
      ['Bandcamp'],
    )
  },
  'with a store filter matching no rows returns the entity with no stores': async ({ artistId }) => {
    const details = await queryEntityDetails('artist', artistId, ['beatport'])
    assert.strictEqual(details.id, artistId)
    assert.deepStrictEqual(details.stores, [])
  },
  teardown: async ({ artistId }) => {
    await pg.queryAsync(sql`DELETE FROM store__artist WHERE artist_id = ${artistId}`)
    await pg.queryAsync(sql`DELETE FROM artist WHERE artist_id = ${artistId}`)
  },
})

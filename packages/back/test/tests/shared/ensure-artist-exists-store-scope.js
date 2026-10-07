const assert = require('assert')
const { test } = require('cascade-test')
const sql = require('sql-template-strings')
const BPromise = require('bluebird')
const pg = require('fomoplayer_shared').db.pg

const { initDb } = require('../../lib/db')
const { ensureArtistExists } = require('../../../routes/shared/db/store')
const { storeUrl: beatportUrl } = require('../../../routes/stores/beatport/logic')

// Following a Beatport artist resolves the store artist through
// ensureArtistExists. When the artist also had a Bandcamp row without a URL,
// the lookup returned that row instead, so the follow was stored on a row the
// follow list hides and the follow button never flipped.
const ARTIST_NAME = 'ensure-artist store scope fixture'
const BEATPORT_ID = '990000001'
const BEATPORT_URL = `https://www.beatport.com/artist/ensure-artist-fixture/${BEATPORT_ID}`

const storeArtistIdFor = async (artistId, storeName) => {
  const [{ store__artist_id }] = await pg.queryRowsAsync(sql`
    SELECT store__artist_id FROM store__artist NATURAL JOIN store
    WHERE artist_id = ${artistId} AND store_name = ${storeName}`)
  return store__artist_id
}

test({
  setup: async () => {
    await initDb()
    const [{ artist_id: artistId }] = await pg.queryRowsAsync(
      sql`INSERT INTO artist (artist_name) VALUES (${ARTIST_NAME}) RETURNING artist_id`,
    )
    // Bandcamp row first so it has the lower id, as for the affected artists.
    await pg.queryAsync(sql`
      INSERT INTO store__artist (store__artist_store_id, store__artist_url, store_id, artist_id)
      SELECT NULL, NULL, store_id, ${artistId} FROM store WHERE store_name = 'Bandcamp'`)
    await pg.queryAsync(sql`
      INSERT INTO store__artist (store__artist_store_id, store__artist_url, store_id, artist_id)
      SELECT ${BEATPORT_ID}, ${BEATPORT_URL}, store_id, ${artistId} FROM store WHERE store_name = 'Beatport'`)
    return { artistId }
  },
  'resolves the Beatport store artist, not the Bandcamp one': async ({ artistId }) => {
    const { id, storeArtistId } = await BPromise.using(pg.getTransaction(), async (tx) => {
      // The small test tables are scanned in store order (Beatport first),
      // which hides the bug. Force index scans so the Bandcamp row (lower
      // store__artist_id) comes first, as it does on the production tables.
      await tx.queryAsync('SET LOCAL enable_hashjoin = off')
      await tx.queryAsync('SET LOCAL enable_mergejoin = off')
      await tx.queryAsync('SET LOCAL enable_seqscan = off')
      return ensureArtistExists(tx, beatportUrl, { id: BEATPORT_ID, url: BEATPORT_URL, name: ARTIST_NAME }, null)
    })
    assert.strictEqual(id, artistId)
    assert.strictEqual(storeArtistId, await storeArtistIdFor(artistId, 'Beatport'))
  },
  teardown: async ({ artistId }) => {
    await pg.queryAsync(sql`DELETE FROM store__artist WHERE artist_id = ${artistId}`)
    await pg.queryAsync(sql`DELETE FROM artist WHERE artist_id = ${artistId}`)
  },
})

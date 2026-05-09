const assert = require('assert')
const sql = require('sql-template-strings')
const { test } = require('cascade-test')

const { initDb, pg } = require('../../lib/db')
const { queryKnownReleaseUrls } = require('../../../routes/stores/bandcamp/db.js')

const BANDCAMP_STORE_URL = 'https://bandcamp.com'

const insertStoreReleaseRows = async (storeId, urls) => {
  const ids = []
  for (const url of urls) {
    const [{ release_id }] = await pg.queryRowsAsync(
      sql`INSERT INTO release (release_name) VALUES (${`fixture release for ${url}`}) RETURNING release_id`,
    )
    await pg.queryAsync(
      sql`INSERT INTO store__release (release_id, store_id, store__release_store_id, store__release_url)
          VALUES (${release_id}, ${storeId}, ${url}, ${url})`,
    )
    ids.push(release_id)
  }
  return ids
}

test({
  setup: async () => {
    await initDb()
    const [{ store_id }] = await pg.queryRowsAsync(
      sql`SELECT store_id FROM store WHERE store_url = ${BANDCAMP_STORE_URL}`,
    )
    const knownUrls = [
      'https://noisia.bandcamp.com/album/outer-edges',
      'https://noisia.bandcamp.com/album/halcyon',
      'https://noisia.bandcamp.com/album/the-hole-pt-1',
    ]
    const releaseIds = await insertStoreReleaseRows(store_id, knownUrls)
    return { storeId: store_id, knownUrls, releaseIds }
  },
  teardown: async ({ releaseIds }) => {
    if (releaseIds?.length) {
      await pg.queryAsync(sql`DELETE FROM store__release WHERE release_id = ANY(${releaseIds})`)
      await pg.queryAsync(sql`DELETE FROM release WHERE release_id = ANY(${releaseIds})`)
    }
  },

  'queryKnownReleaseUrls returns the intersection with the input URL list': async ({ storeId, knownUrls }) => {
    const probe = [
      ...knownUrls,
      'https://noisia.bandcamp.com/album/never-stored',
      'https://noisia.bandcamp.com/track/standalone',
    ]
    const matched = await queryKnownReleaseUrls(storeId, probe)
    assert.ok(matched instanceof Set)
    assert.strictEqual(matched.size, knownUrls.length)
    for (const url of knownUrls) assert.ok(matched.has(url), `expected ${url} in known set`)
    assert.ok(!matched.has('https://noisia.bandcamp.com/album/never-stored'))
    assert.ok(!matched.has('https://noisia.bandcamp.com/track/standalone'))
  },

  'queryKnownReleaseUrls returns empty Set for empty input': async ({ storeId }) => {
    const matched = await queryKnownReleaseUrls(storeId, [])
    assert.ok(matched instanceof Set)
    assert.strictEqual(matched.size, 0)
  },

  'queryKnownReleaseUrls scopes by store_id': async ({ knownUrls }) => {
    // Different store_id (Beatport) — should match nothing.
    const [{ store_id: beatportStoreId }] = await pg.queryRowsAsync(
      sql`SELECT store_id FROM store WHERE store_name = 'Beatport'`,
    )
    const matched = await queryKnownReleaseUrls(beatportStoreId, knownUrls)
    assert.strictEqual(matched.size, 0, 'release_url should not match if scoped to a different store_id')
  },
})

const assert = require('assert')
const sql = require('sql-template-strings')
const { test } = require('cascade-test')

const { initDb, pg } = require('../../../lib/db')
const { resolveTestUserId } = require('../../../lib/test-user')
const {
  getArtistFollowDetails,
  getLabelFollowDetails,
  DEFAULT_BATCH_SIZE,
} = require('../../../../jobs/watches/shared/db')

const BANDCAMP_STORE_URL = 'https://bandcamp.com'

const MINUTES = 60 * 1000
const HOURS = 60 * MINUTES

const insertArtistWatchForUser = async ({ userId, storeId, slug, lastUpdate }) => {
  const [{ artist_id }] = await pg.queryRowsAsync(
    sql`INSERT INTO artist (artist_name) VALUES (${`fixture artist ${slug}`}) RETURNING artist_id`,
  )
  const [{ store__artist_id }] = await pg.queryRowsAsync(
    sql`INSERT INTO store__artist (artist_id, store_id, store__artist_store_id, store__artist_url, store__artist_last_update)
        VALUES (${artist_id}, ${storeId}, ${slug}, ${`${BANDCAMP_STORE_URL}/artist/${slug}`}, ${lastUpdate})
        RETURNING store__artist_id`,
  )
  await pg.queryAsync(
    sql`INSERT INTO store__artist_watch (store__artist_id) VALUES (${store__artist_id})`,
  )
  await pg.queryAsync(
    sql`INSERT INTO store__artist_watch__user (store__artist_watch_id, meta_account_user_id)
        SELECT store__artist_watch_id, ${userId}
        FROM store__artist_watch
        WHERE store__artist_id = ${store__artist_id}`,
  )
  return { artistId: artist_id, storeArtistId: store__artist_id }
}

const insertLabelWatchForUser = async ({ userId, storeId, slug, lastUpdate }) => {
  const [{ label_id }] = await pg.queryRowsAsync(
    sql`INSERT INTO label (label_name) VALUES (${`fixture label ${slug}`}) RETURNING label_id`,
  )
  const [{ store__label_id }] = await pg.queryRowsAsync(
    sql`INSERT INTO store__label (label_id, store_id, store__label_store_id, store__label_url, store__label_last_update)
        VALUES (${label_id}, ${storeId}, ${slug}, ${`${BANDCAMP_STORE_URL}/label/${slug}`}, ${lastUpdate})
        RETURNING store__label_id`,
  )
  await pg.queryAsync(
    sql`INSERT INTO store__label_watch (store__label_id) VALUES (${store__label_id})`,
  )
  await pg.queryAsync(
    sql`INSERT INTO store__label_watch__user (store__label_watch_id, meta_account_user_id)
        SELECT store__label_watch_id, ${userId}
        FROM store__label_watch
        WHERE store__label_id = ${store__label_id}`,
  )
  return { labelId: label_id, storeLabelId: store__label_id }
}

const isoMinusMs = (ms) => new Date(Date.now() - ms).toISOString()

test({
  setup: async () => {
    await initDb()
    const userId = await resolveTestUserId()
    const [{ store_id }] = await pg.queryRowsAsync(
      sql`SELECT store_id FROM store WHERE store_url = ${BANDCAMP_STORE_URL}`,
    )

    const stale30hAgo = isoMinusMs(30 * HOURS)
    const stale20hAgo = isoMinusMs(20 * HOURS)
    const stale10hAgo = isoMinusMs(10 * HOURS)
    const stale7hAgo = isoMinusMs(7 * HOURS)
    const fresh30mAgo = isoMinusMs(30 * MINUTES)

    const artistIds = []
    const baseArtistIds = []
    for (const { slug, lastUpdate } of [
      { slug: 'artist-stale-30h', lastUpdate: stale30hAgo },
      { slug: 'artist-stale-20h', lastUpdate: stale20hAgo },
      { slug: 'artist-stale-10h', lastUpdate: stale10hAgo },
      { slug: 'artist-stale-7h', lastUpdate: stale7hAgo },
      { slug: 'artist-fresh-30m', lastUpdate: fresh30mAgo },
      { slug: 'artist-never-checked', lastUpdate: null },
    ]) {
      const { artistId, storeArtistId } = await insertArtistWatchForUser({ userId, storeId: store_id, slug, lastUpdate })
      artistIds.push(storeArtistId)
      baseArtistIds.push(artistId)
    }

    const labelIds = []
    const baseLabelIds = []
    for (const { slug, lastUpdate } of [
      { slug: 'label-stale-30h', lastUpdate: stale30hAgo },
      { slug: 'label-fresh-30m', lastUpdate: fresh30mAgo },
      { slug: 'label-never-checked', lastUpdate: null },
    ]) {
      const { labelId, storeLabelId } = await insertLabelWatchForUser({ userId, storeId: store_id, slug, lastUpdate })
      labelIds.push(storeLabelId)
      baseLabelIds.push(labelId)
    }

    return { userId, storeId: store_id, artistIds, labelIds, baseArtistIds, baseLabelIds }
  },
  teardown: async ({ artistIds, labelIds, baseArtistIds, baseLabelIds }) => {
    if (artistIds?.length) await pg.queryAsync(sql`DELETE FROM store__artist WHERE store__artist_id = ANY(${artistIds})`)
    if (baseArtistIds?.length) await pg.queryAsync(sql`DELETE FROM artist WHERE artist_id = ANY(${baseArtistIds})`)
    if (labelIds?.length) await pg.queryAsync(sql`DELETE FROM store__label WHERE store__label_id = ANY(${labelIds})`)
    if (baseLabelIds?.length) await pg.queryAsync(sql`DELETE FROM label WHERE label_id = ANY(${baseLabelIds})`)
  },

  'getArtistFollowDetails: default options return at most DEFAULT_BATCH_SIZE rows in last_update ASC NULLS FIRST order': async () => {
    const rows = await getArtistFollowDetails(BANDCAMP_STORE_URL)
    assert.ok(rows.length <= DEFAULT_BATCH_SIZE, `expected ≤ ${DEFAULT_BATCH_SIZE} rows, got ${rows.length}`)
    // never-checked first, then stale rows in ascending last_update order, no fresh-30m row.
    const slugs = rows.map((r) => r.url.split('/').pop())
    assert.strictEqual(slugs[0], 'artist-never-checked', 'NULL last_update must come first')
    assert.deepStrictEqual(
      slugs,
      ['artist-never-checked', 'artist-stale-30h', 'artist-stale-20h', 'artist-stale-10h', 'artist-stale-7h'],
      'remaining rows must be ordered by last_update ASC, fresh-30m excluded by default 6h refresh interval',
    )
  },

  'getArtistFollowDetails: explicit batchSize=2 returns 2 rows, the two oldest': async () => {
    const rows = await getArtistFollowDetails(BANDCAMP_STORE_URL, { batchSize: 2 })
    assert.strictEqual(rows.length, 2)
    const slugs = rows.map((r) => r.url.split('/').pop())
    assert.deepStrictEqual(slugs, ['artist-never-checked', 'artist-stale-30h'])
  },

  'getArtistFollowDetails: refreshInterval=24h excludes the 20h-stale row too': async () => {
    const rows = await getArtistFollowDetails(BANDCAMP_STORE_URL, { refreshInterval: '24 hours' })
    const slugs = rows.map((r) => r.url.split('/').pop())
    assert.deepStrictEqual(
      slugs,
      ['artist-never-checked', 'artist-stale-30h'],
      'with a 24h refresh interval, only NULL and >24h-stale rows qualify',
    )
  },

  'getArtistFollowDetails: rows include lastUpdate field': async () => {
    const rows = await getArtistFollowDetails(BANDCAMP_STORE_URL, { batchSize: 1 })
    assert.strictEqual(rows.length, 1)
    assert.ok('lastUpdate' in rows[0], 'row must expose lastUpdate field')
    assert.strictEqual(rows[0].lastUpdate, null, 'never-checked row has lastUpdate === null')
  },

  'getLabelFollowDetails: respects batchSize and freshness filter': async () => {
    const rows = await getLabelFollowDetails(BANDCAMP_STORE_URL, { batchSize: 5 })
    const slugs = rows.map((r) => r.url.split('/').pop())
    assert.deepStrictEqual(
      slugs,
      ['label-never-checked', 'label-stale-30h'],
      'fresh-30m label is excluded by 6h refresh interval; never-checked first',
    )
  },
})

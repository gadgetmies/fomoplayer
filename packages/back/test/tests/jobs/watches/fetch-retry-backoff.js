/**
 * A followed artist or label whose fetch fails is postponed instead of coming
 * first in the next batch again: 30 minutes after the first failure, doubling
 * per further failure, and a successful fetch clears it.
 */
const assert = require('assert')
const sql = require('sql-template-strings')
const { test } = require('cascade-test')

const { initDb, pg } = require('../../../lib/db')
const { resolveTestUserId } = require('../../../lib/test-user')
const { getArtistFollowDetails, getLabelFollowDetails } = require('../../../../jobs/watches/shared/db')
const {
  setArtistFetchFailed,
  setArtistUpdated,
  setLabelFetchFailed,
} = require('../../../../routes/shared/db/watch')

const BANDCAMP_STORE_URL = 'https://bandcamp.com'
const options = { batchSize: 1000, refreshInterval: '6 hours' }

const insertWatchedArtist = async (userId, storeId, slug) => {
  const [{ artist_id }] = await pg.queryRowsAsync(sql`INSERT INTO artist (artist_name) VALUES (${slug}) RETURNING artist_id`)
  const [{ store__artist_id }] = await pg.queryRowsAsync(
    // last_update a day ago: due for a refresh, so only the backoff can hide it.
    sql`INSERT INTO store__artist (artist_id, store_id, store__artist_store_id, store__artist_url, store__artist_last_update)
        VALUES (${artist_id}, ${storeId}, ${slug}, ${`https://${slug}.bandcamp.com`}, NOW() - INTERVAL '1 day')
        RETURNING store__artist_id`,
  )
  await pg.queryAsync(sql`INSERT INTO store__artist_watch (store__artist_id) VALUES (${store__artist_id})`)
  await pg.queryAsync(
    sql`INSERT INTO store__artist_watch__user (store__artist_watch_id, meta_account_user_id)
        SELECT store__artist_watch_id, ${userId} FROM store__artist_watch WHERE store__artist_id = ${store__artist_id}`,
  )
  return store__artist_id
}

const insertWatchedLabel = async (userId, storeId, slug) => {
  const [{ label_id }] = await pg.queryRowsAsync(sql`INSERT INTO label (label_name) VALUES (${slug}) RETURNING label_id`)
  const [{ store__label_id }] = await pg.queryRowsAsync(
    sql`INSERT INTO store__label (label_id, store_id, store__label_store_id, store__label_url, store__label_last_update)
        VALUES (${label_id}, ${storeId}, ${slug}, ${`https://${slug}.bandcamp.com`}, NOW() - INTERVAL '1 day')
        RETURNING store__label_id`,
  )
  await pg.queryAsync(sql`INSERT INTO store__label_watch (store__label_id) VALUES (${store__label_id})`)
  await pg.queryAsync(
    sql`INSERT INTO store__label_watch__user (store__label_watch_id, meta_account_user_id)
        SELECT store__label_watch_id, ${userId} FROM store__label_watch WHERE store__label_id = ${store__label_id}`,
  )
  return store__label_id
}

const artistBackoff = async (storeArtistId) => {
  const [row] = await pg.queryRowsAsync(
    sql`SELECT store__artist_fetch_failure_count AS count,
               EXTRACT(EPOCH FROM store__artist_fetch_retry_after - NOW()) / 60 AS "minutesLeft"
        FROM store__artist WHERE store__artist_id = ${storeArtistId}`,
  )
  return row
}

const selectedArtistIds = async () => (await getArtistFollowDetails(BANDCAMP_STORE_URL, options)).map((r) => r.storeArtistId)

test({
  setup: async () => {
    await initDb()
    const userId = await resolveTestUserId()
    const [{ store_id }] = await pg.queryRowsAsync(sql`SELECT store_id FROM store WHERE store_url = ${BANDCAMP_STORE_URL}`)
    return { userId, storeId: store_id }
  },

  'a failed artist is skipped until its retry time, with the wait doubling': async ({ userId, storeId }) => {
    const storeArtistId = await insertWatchedArtist(userId, storeId, 'backoff-artist')
    assert.ok((await selectedArtistIds()).includes(storeArtistId))

    await setArtistFetchFailed(storeArtistId)
    let backoff = await artistBackoff(storeArtistId)
    assert.strictEqual(backoff.count, 1)
    assert.ok(Math.abs(backoff.minutesLeft - 30) < 1, `first wait ~30 min, got ${backoff.minutesLeft}`)
    assert.ok(!(await selectedArtistIds()).includes(storeArtistId), 'postponed artist must not be selected')

    await setArtistFetchFailed(storeArtistId)
    backoff = await artistBackoff(storeArtistId)
    assert.strictEqual(backoff.count, 2)
    assert.ok(Math.abs(backoff.minutesLeft - 60) < 1, `second wait ~60 min, got ${backoff.minutesLeft}`)

    await pg.queryAsync(
      sql`UPDATE store__artist SET store__artist_fetch_retry_after = NOW() - INTERVAL '1 minute' WHERE store__artist_id = ${storeArtistId}`,
    )
    assert.ok((await selectedArtistIds()).includes(storeArtistId), 'due again once the retry time passes')
  },

  'the wait is capped at a day': async ({ userId, storeId }) => {
    const storeArtistId = await insertWatchedArtist(userId, storeId, 'backoff-capped')
    for (let i = 0; i < 10; i++) await setArtistFetchFailed(storeArtistId)
    const { minutesLeft } = await artistBackoff(storeArtistId)
    assert.ok(Math.abs(minutesLeft - 24 * 60) < 1, `capped at 24 h, got ${minutesLeft} min`)
  },

  'a successful fetch clears the backoff': async ({ userId, storeId }) => {
    const storeArtistId = await insertWatchedArtist(userId, storeId, 'backoff-recovers')
    await setArtistFetchFailed(storeArtistId)
    await setArtistUpdated(storeArtistId)
    const backoff = await artistBackoff(storeArtistId)
    assert.strictEqual(backoff.count, 0)
    assert.strictEqual(backoff.minutesLeft, null)
  },

  'labels are postponed the same way': async ({ userId, storeId }) => {
    const storeLabelId = await insertWatchedLabel(userId, storeId, 'backoff-label')
    const selected = async () => (await getLabelFollowDetails(BANDCAMP_STORE_URL, options)).map((r) => r.storeLabelId)
    assert.ok((await selected()).includes(storeLabelId))
    await setLabelFetchFailed(storeLabelId)
    assert.ok(!(await selected()).includes(storeLabelId))
  },
})

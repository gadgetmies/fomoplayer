/**
 * Bandcamp stream URLs are stored per preview, so playing a Bandcamp track does not look its release up at Bandcamp
 * every time. A stored URL is replaced when it is older than the refresh age or when the player could not play it;
 * the lookup replaces the URLs of every track of the release, as they were issued together.
 */
const assert = require('assert')
const { test } = require('cascade-test')
const sql = require('sql-template-strings')

const { initDb, pg } = require('../../lib/db')
const bandcampApi = require('../../../routes/stores/bandcamp/bandcamp-api')
const { storeStreamUrls, getStreamUrl, knownStreamUrl } = require('../../../routes/stores/bandcamp/stream-urls')
const { getPreviewDetails } = require('../../../routes/stores/bandcamp/logic')

const BANDCAMP_STORE_ID = 2
const RELEASE_URL = 'https://stream-urls.bandcamp.com/album/one'
const redirect = (trackId, n = 1) =>
  `https://bandcamp.com/stream_redirect?enc=mp3-128&track_id=${trackId}&ts=${n}&t=sig${n}`

const created = { previews: [], tracks: [], releases: [] }
let counter = 0

const insertTrack = async (releaseId) => {
  counter++
  const storeTrackId = String(800000 + counter)
  const [{ track_id }] = await pg.queryRowsAsync(
    sql`INSERT INTO track (track_title) VALUES (${`Stream track ${counter}`}) RETURNING track_id`,
  )
  created.tracks.push(track_id)
  const [{ store__track_id }] = await pg.queryRowsAsync(
    sql`INSERT INTO store__track (track_id, store_id, store__track_store_id, store__track_url)
        VALUES (${track_id}, ${BANDCAMP_STORE_ID}, ${storeTrackId}, ${`https://example.com/stream/${counter}`})
        RETURNING store__track_id`,
  )
  const [{ id }] = await pg.queryRowsAsync(
    sql`INSERT INTO store__track_preview (store__track_id, store__track_preview_format)
        VALUES (${store__track_id}, 'mp3') RETURNING store__track_preview_id AS id`,
  )
  created.previews.push(id)
  await pg.queryAsync(sql`INSERT INTO release__track (release_id, track_id) VALUES (${releaseId}, ${track_id})`)
  return { previewId: id, storeTrackId }
}

const releaseOf = (tracks, n = 1) => ({
  trackinfo: tracks.map(({ storeTrackId }) => ({
    track_id: Number(storeTrackId),
    file: { 'mp3-128': redirect(storeTrackId, n) },
  })),
})

const storedUrl = async (previewId) =>
  (
    await pg.queryRowsAsync(
      sql`SELECT store__track_preview_stream_url AS url FROM store__track_preview_stream
          WHERE store__track_preview_id = ${previewId}`,
    )
  )[0]?.url

// A fake release fetch returning the next issue of the release's URLs, recording how it was asked.
const fakeFetchRelease = (tracks) => {
  const calls = []
  const fetchRelease = async (url, options) => {
    calls.push({ url, ...options })
    return releaseOf(tracks, calls.length + 1)
  }
  return { calls, fetchRelease }
}

test({
  setup: async () => {
    await initDb()
    const [{ release_id }] = await pg.queryRowsAsync(
      sql`INSERT INTO release (release_name) VALUES ('Stream URL release') RETURNING release_id`,
    )
    created.releases.push(release_id)
    await pg.queryAsync(
      sql`INSERT INTO store__release (release_id, store_id, store__release_store_id, store__release_url)
          VALUES (${release_id}, ${BANDCAMP_STORE_ID}, 'stream-urls-1', ${RELEASE_URL})`,
    )
    const first = await insertTrack(release_id)
    const second = await insertTrack(release_id)
    return { first, second, tracks: [first, second] }
  },

  teardown: async () => {
    const { previews, tracks, releases } = created
    await pg.queryAsync(sql`DELETE FROM store__track_preview WHERE store__track_preview_id = ANY (${previews})`)
    await pg.queryAsync(sql`DELETE FROM release__track WHERE release_id = ANY (${releases})`)
    await pg.queryAsync(sql`DELETE FROM store__release WHERE release_id = ANY (${releases})`)
    await pg.queryAsync(sql`DELETE FROM release WHERE release_id = ANY (${releases})`)
    await pg.queryAsync(sql`DELETE FROM store__track WHERE track_id = ANY (${tracks})`)
    await pg.queryAsync(sql`DELETE FROM track WHERE track_id = ANY (${tracks})`)
  },

  'storing a release stores the URL of each of its previews': async ({ first, second, tracks }) => {
    assert.strictEqual(await storeStreamUrls(releaseOf(tracks)), 2)
    assert.strictEqual(await storedUrl(first.previewId), redirect(first.storeTrackId))
    assert.strictEqual(await storedUrl(second.previewId), redirect(second.storeTrackId))
  },

  'CDN URLs from a scraped page are not stored': async ({ first }) => {
    const cdn = 'https://t4.bcbits.com/stream/abc/mp3-128/1?p=0&ts=1&t=x&token=1_x'
    const stored = await storeStreamUrls({
      trackinfo: [{ track_id: Number(first.storeTrackId), file: { 'mp3-128': cdn } }],
    })
    assert.strictEqual(stored, 0)
    assert.strictEqual(await storedUrl(first.previewId), redirect(first.storeTrackId))
  },

  'a stored URL is served without asking Bandcamp': async ({ first, tracks }) => {
    const { calls, fetchRelease } = fakeFetchRelease(tracks)
    const url = await getStreamUrl(
      { previewId: first.previewId, storeTrackId: first.storeTrackId, releaseUrl: RELEASE_URL },
      { fetchRelease },
    )
    assert.strictEqual(url, redirect(first.storeTrackId))
    assert.deepStrictEqual(calls, [])
  },

  'a refresh looks the release up and replaces the URLs of all its tracks': async ({ first, second, tracks }) => {
    const { calls, fetchRelease } = fakeFetchRelease(tracks)
    const url = await getStreamUrl(
      { previewId: first.previewId, storeTrackId: first.storeTrackId, releaseUrl: RELEASE_URL },
      { refresh: true, priority: true, fetchRelease },
    )
    assert.deepStrictEqual(calls, [{ url: RELEASE_URL, priority: true }])
    assert.strictEqual(url, redirect(first.storeTrackId, 2))
    assert.strictEqual(await storedUrl(second.previewId), redirect(second.storeTrackId, 2))
  },

  'a URL older than the refresh age is looked up again': async ({ second, tracks }) => {
    const ageDays = bandcampApi.static.streamUrlRefreshAgeMs / (24 * 60 * 60 * 1000)
    assert.strictEqual(ageDays, 13, 'the refresh age defaults to 13 days')
    await pg.queryAsync(
      sql`UPDATE store__track_preview_stream
          SET store__track_preview_stream_fetched_at = NOW() - INTERVAL '14 days'
          WHERE store__track_preview_id = ${second.previewId}`,
    )
    const { calls, fetchRelease } = fakeFetchRelease(tracks)
    const url = await getStreamUrl(
      { previewId: second.previewId, storeTrackId: second.storeTrackId, releaseUrl: RELEASE_URL },
      { fetchRelease },
    )
    assert.strictEqual(calls.length, 1)
    assert.strictEqual(url, redirect(second.storeTrackId, 2))
  },

  'a URL kept from a release fetched before the preview was stored is stored': async ({ first }) => {
    await pg.queryAsync(sql`DELETE FROM store__track_preview_stream WHERE store__track_preview_id = ${first.previewId}`)
    const original = bandcampApi.getCachedStreamUrl
    bandcampApi.getCachedStreamUrl = (trackId) =>
      String(trackId) === first.storeTrackId ? redirect(first.storeTrackId, 9) : null
    try {
      const url = await knownStreamUrl({ previewId: first.previewId, storeTrackId: first.storeTrackId })
      assert.strictEqual(url, redirect(first.storeTrackId, 9))
    } finally {
      bandcampApi.getCachedStreamUrl = original
    }
    assert.strictEqual(await storedUrl(first.previewId), redirect(first.storeTrackId, 9))
  },

  'the player': {
    setup: async (context) => {
      const fake = fakeFetchRelease(context.tracks)
      const original = bandcampApi.fetchRelease
      bandcampApi.fetchRelease = fake.fetchRelease
      return { ...context, fake, original }
    },
    teardown: async ({ original }) => {
      bandcampApi.fetchRelease = original
    },

    'gets the stored URL': async ({ first, fake }) => {
      const { url } = await getPreviewDetails(first.previewId)
      assert.strictEqual(url, redirect(first.storeTrackId, 9))
      assert.deepStrictEqual(fake.calls, [])
    },

    'asking to refresh looks the release up ahead of the queue': async ({ first, fake }) => {
      const { url } = await getPreviewDetails(first.previewId, { refresh: true })
      assert.deepStrictEqual(fake.calls, [{ url: RELEASE_URL, priority: true }])
      assert.strictEqual(url, redirect(first.storeTrackId, 2))
    },

    'a prefetch for the next track waits in the queue': async ({ second, fake }) => {
      await pg.queryAsync(
        sql`DELETE FROM store__track_preview_stream WHERE store__track_preview_id = ${second.previewId}`,
      )
      bandcampApi.forgetStreamUrl(second.storeTrackId)
      await getPreviewDetails(second.previewId, { prefetch: true })
      assert.deepStrictEqual(fake.calls.at(-1), { url: RELEASE_URL, priority: false })
    },
  },
})

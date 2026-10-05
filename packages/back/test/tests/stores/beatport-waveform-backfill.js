const assert = require('assert')
const { test } = require('cascade-test')
const sql = require('sql-template-strings')
const { initDb, pg } = require('../../lib/db.js')
const { addNewBeatportTracksToDb } = require('../../lib/tracks.js')
const { resolveTestUserId } = require('../../lib/test-user')
const bpApi = require('../../../routes/stores/beatport/bp-api')
const { backfillBeatportWaveforms } = require('../../../scripts/backfill-beatport-waveforms')
const trackFixture = require('../../fixtures/noisia_block_control_beatport.json')

const rawTrack = trackFixture.pageProps.dehydratedState.queries[0].state.data
const storedWaveformUrl = rawTrack.image.uri
const upstreamWaveformUrl = 'https://geo-media.beatport.com/image_size/1500x250/upstream-waveform.png'
let upstreamTrack = rawTrack

const queryWaveformUrls = () =>
  pg.queryRowsAsync(sql`
SELECT store__track_preview_waveform_url AS url
FROM store__track_preview_waveform NATURAL JOIN store__track_preview NATURAL JOIN store__track
WHERE store__track_store_id = ${String(rawTrack.id)}
ORDER BY store__track_preview_waveform_url`)

const queryTrackDetailsWaveforms = async () =>
  (
    await pg.queryRowsAsync(sql`
SELECT track_details->'previews' AS previews
FROM track_details NATURAL JOIN store__track
WHERE store__track_store_id = ${String(rawTrack.id)}`)
  )[0].previews.flatMap(({ waveforms }) => waveforms)

// Leaves the stored preview with only an empty-URL waveform row, as some
// production previews have, and refreshes track_details to match.
const replaceWaveformsWithEmptyRow = async () => {
  await pg.queryAsync(sql`
DELETE FROM store__track_preview_waveform
WHERE store__track_preview_id IN (SELECT store__track_preview_id
                                  FROM store__track_preview NATURAL JOIN store__track
                                  WHERE store__track_store_id = ${String(rawTrack.id)})`)
  await pg.queryAsync(sql`
INSERT INTO store__track_preview_waveform (store__track_preview_id, store__track_preview_waveform_url)
SELECT store__track_preview_id, ''
FROM store__track_preview NATURAL JOIN store__track
WHERE store__track_store_id = ${String(rawTrack.id)}`)
}

const silent = () => {}

test({
  setup: async () => {
    const original = { getTracksByIds: bpApi.getTracksByIds, getTrack: bpApi.getTrack }
    bpApi.getTracksByIds = async (ids) => (ids.includes(String(rawTrack.id)) ? [upstreamTrack] : [])
    bpApi.getTrack = async (id) => {
      if (id === String(rawTrack.id)) return upstreamTrack
      throw new Error(`Beatport API request failed (404) for /catalog/tracks/${id}/`)
    }

    await initDb()
    const userId = await resolveTestUserId()
    await addNewBeatportTracksToDb(trackFixture, false, [userId])
    await replaceWaveformsWithEmptyRow()
    return { original }
  },

  'the preview only has an empty waveform URL': async () => {
    assert.deepStrictEqual(await queryWaveformUrls(), [{ url: '' }])
  },

  'a dry run reports the track but writes nothing': async () => {
    const stats = await backfillBeatportWaveforms({ log: silent })
    assert.strictEqual(stats.storeTracksMissing, 1)
    assert.strictEqual(stats.updated, 1)
    assert.deepStrictEqual(await queryWaveformUrls(), [{ url: '' }])
  },

  'when applied': {
    setup: async () => ({ stats: await backfillBeatportWaveforms({ apply: true, concurrency: 4, log: silent }) }),

    'replaces the empty row with the upstream waveform': async ({ stats }) => {
      assert.strictEqual(stats.updated, 1)
      assert.strictEqual(stats.previewsUpdated, 1)
      assert.strictEqual(stats.failed, 0)
      assert.deepStrictEqual(await queryWaveformUrls(), [{ url: storedWaveformUrl }])
    },

    'refreshes track_details so the player gets the waveform': async () => {
      assert.deepStrictEqual(await queryTrackDetailsWaveforms(), [storedWaveformUrl])
    },

    'a second run finds nothing left to backfill': async () => {
      const stats = await backfillBeatportWaveforms({ apply: true, log: silent })
      assert.strictEqual(stats.candidates, 0)
    },

    '--verify-existing leaves working URLs alone': async () => {
      const checked = []
      const stats = await backfillBeatportWaveforms({
        apply: true,
        verifyExisting: true,
        checkUrl: async (url) => checked.push(url) && true,
        log: silent,
      })
      assert.deepStrictEqual(checked, [storedWaveformUrl])
      assert.strictEqual(stats.storeTracksMissing, 0)
      assert.deepStrictEqual(await queryWaveformUrls(), [{ url: storedWaveformUrl }])
    },

    '--verify-existing does not replace a broken URL Beatport still returns': async () => {
      const stats = await backfillBeatportWaveforms({
        apply: true,
        verifyExisting: true,
        checkUrl: async () => false,
        log: silent,
      })
      assert.strictEqual(stats.brokenUrls, 1)
      assert.strictEqual(stats.upstreamUnchanged, 1)
      assert.deepStrictEqual(await queryWaveformUrls(), [{ url: storedWaveformUrl }])
    },

    '--verify-existing replaces a broken URL with the new upstream one': async () => {
      upstreamTrack = { ...rawTrack, image: { ...rawTrack.image, uri: upstreamWaveformUrl } }
      const stats = await backfillBeatportWaveforms({
        apply: true,
        verifyExisting: true,
        checkUrl: async (url) => url !== storedWaveformUrl,
        log: silent,
      })
      assert.strictEqual(stats.updated, 1)
      assert.deepStrictEqual(await queryWaveformUrls(), [{ url: upstreamWaveformUrl }])
      assert.deepStrictEqual(await queryTrackDetailsWaveforms(), [upstreamWaveformUrl])
    },

    'a URL check that cannot tell keeps the stored URL': async () => {
      const stats = await backfillBeatportWaveforms({
        apply: true,
        verifyExisting: true,
        checkUrl: async () => null,
        log: silent,
      })
      assert.strictEqual(stats.urlCheckErrors, 1)
      assert.strictEqual(stats.storeTracksMissing, 0)
    },
  },

  'a track removed from Beatport is reported, not written': {
    setup: async () => {
      await replaceWaveformsWithEmptyRow()
      bpApi.getTracksByIds = async () => []
      bpApi.getTrack = async (id) => {
        throw new Error(`Beatport API request failed (404) for /catalog/tracks/${id}/`)
      }
      return { stats: await backfillBeatportWaveforms({ apply: true, log: silent }) }
    },

    'counts it as not found': async ({ stats }) => {
      assert.strictEqual(stats.notFound, 1)
      assert.strictEqual(stats.updated, 0)
      assert.deepStrictEqual(await queryWaveformUrls(), [{ url: '' }])
    },
  },

  teardown: async ({ original }) => {
    Object.assign(bpApi, original)
    await initDb()
  },
})

const assert = require('assert')
const { test } = require('cascade-test')

const { initDb } = require('../../lib/db')
const { resolveTestUserId } = require('../../lib/test-user')
const { addBandcampTracks, teardownTracks } = require('../../lib/tracks')
const { queryHeardStatusForStoreIds, setTrackHeard } = require('../../../routes/users/db')
const { storeUrl: bandcampStoreUrl } = require('../../../routes/stores/bandcamp/logic')

const HEARD_BANDCAMP_ID = '900000001'
const UNHEARD_BANDCAMP_ID = '900000002'
const ORPHAN_BANDCAMP_ID = '900000003'
const UNKNOWN_BANDCAMP_ID = '900000999'

const ISO_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/

const bandcampTrack = (id, label) => ({
  id,
  url: `https://example.bandcamp.com/track/${label}`,
  title: `heard-lookup fixture ${label}`,
  version: null,
  duration_ms: 180000,
  released: '2026-04-01T12:00:00Z',
  published: '2026-04-01T12:00:00Z',
  track_number: 1,
  isrc: null,
  artists: [
    { name: `heard-lookup artist ${label}`, role: 'author', id: `artist-${label}`, url: `https://${label}.bandcamp.com` },
  ],
  release: {
    id: `release-${label}`,
    url: `https://example.bandcamp.com/album/${label}`,
    title: `heard-lookup release ${label}`,
    release_date: '2026-04-01T12:00:00Z',
    catalog_number: null,
    isrc: null,
  },
  previews: [
    { format: 'mp3', url: `https://example.bandcamp.com/preview/${label}.mp3`, start_ms: 0, end_ms: 180000 },
  ],
})

test({
  setup: async () => {
    await initDb()
    const userId = await resolveTestUserId()

    const linkedSeed = await addBandcampTracks(
      [bandcampTrack(HEARD_BANDCAMP_ID, 'heard'), bandcampTrack(UNHEARD_BANDCAMP_ID, 'unheard')],
      [userId],
    )
    const orphanSeed = await addBandcampTracks([bandcampTrack(ORPHAN_BANDCAMP_ID, 'orphan')], [])

    const [heardTrackId, unheardTrackId] = linkedSeed.addedTracks
    const [orphanTrackId] = orphanSeed.addedTracks
    const heardResult = await setTrackHeard(heardTrackId, userId, true)

    return {
      userId,
      heardTrackId,
      unheardTrackId,
      orphanTrackId,
      heardAtIso: heardResult.heardAt,
      addedTracks: [...linkedSeed.addedTracks, ...orphanSeed.addedTracks],
      addedSources: [linkedSeed.sourceId, orphanSeed.sourceId],
    }
  },

  teardown: async (ctx) => {
    await teardownTracks(ctx)
  },

  'heard track resolves to { trackId, heard: ISO }': async ({ userId, heardTrackId, heardAtIso }) => {
    const lookup = await queryHeardStatusForStoreIds(userId, bandcampStoreUrl, [HEARD_BANDCAMP_ID])
    assert.deepStrictEqual(lookup, {
      [HEARD_BANDCAMP_ID]: { trackId: Number(heardTrackId), heard: heardAtIso },
    })
    assert.ok(ISO_REGEX.test(lookup[HEARD_BANDCAMP_ID].heard), 'heard must be a valid ISO timestamp')
  },

  'unheard track resolves to { trackId, heard: null }': async ({ userId, unheardTrackId }) => {
    const lookup = await queryHeardStatusForStoreIds(userId, bandcampStoreUrl, [UNHEARD_BANDCAMP_ID])
    assert.deepStrictEqual(lookup, {
      [UNHEARD_BANDCAMP_ID]: { trackId: Number(unheardTrackId), heard: null },
    })
  },

  'track present in store__track but not in user library resolves to null': async ({ userId }) => {
    const lookup = await queryHeardStatusForStoreIds(userId, bandcampStoreUrl, [ORPHAN_BANDCAMP_ID])
    assert.deepStrictEqual(lookup, { [ORPHAN_BANDCAMP_ID]: null })
  },

  'completely unknown Bandcamp id resolves to null': async ({ userId }) => {
    const lookup = await queryHeardStatusForStoreIds(userId, bandcampStoreUrl, [UNKNOWN_BANDCAMP_ID])
    assert.deepStrictEqual(lookup, { [UNKNOWN_BANDCAMP_ID]: null })
  },

  'bulk lookup covers every input id with no extras': async ({
    userId,
    heardTrackId,
    unheardTrackId,
    heardAtIso,
  }) => {
    const lookup = await queryHeardStatusForStoreIds(userId, bandcampStoreUrl, [
      HEARD_BANDCAMP_ID,
      UNHEARD_BANDCAMP_ID,
      ORPHAN_BANDCAMP_ID,
      UNKNOWN_BANDCAMP_ID,
    ])
    assert.deepStrictEqual(
      Object.keys(lookup).sort(),
      [HEARD_BANDCAMP_ID, ORPHAN_BANDCAMP_ID, UNHEARD_BANDCAMP_ID, UNKNOWN_BANDCAMP_ID].sort(),
    )
    assert.deepStrictEqual(lookup[HEARD_BANDCAMP_ID], {
      trackId: Number(heardTrackId),
      heard: heardAtIso,
    })
    assert.deepStrictEqual(lookup[UNHEARD_BANDCAMP_ID], {
      trackId: Number(unheardTrackId),
      heard: null,
    })
    assert.strictEqual(lookup[ORPHAN_BANDCAMP_ID], null)
    assert.strictEqual(lookup[UNKNOWN_BANDCAMP_ID], null)
  },

  'empty id list returns empty map': async ({ userId }) => {
    const lookup = await queryHeardStatusForStoreIds(userId, bandcampStoreUrl, [])
    assert.deepStrictEqual(lookup, {})
  },

  'lookup does not modify user__track heard timestamp': async ({ userId, heardAtIso }) => {
    await queryHeardStatusForStoreIds(userId, bandcampStoreUrl, [
      HEARD_BANDCAMP_ID,
      UNHEARD_BANDCAMP_ID,
      ORPHAN_BANDCAMP_ID,
      UNKNOWN_BANDCAMP_ID,
    ])
    const after = await queryHeardStatusForStoreIds(userId, bandcampStoreUrl, [HEARD_BANDCAMP_ID])
    assert.strictEqual(after[HEARD_BANDCAMP_ID].heard, heardAtIso, 'heard timestamp must not change after lookup')
  },
})

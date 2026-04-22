const spotifyInterceptor = require('fomoplayer_shared').interceptors.spotify.init()
const L = require('partial.lenses')
const R = require('ramda')
const { initDb, pg } = require('../../../lib/db.js')
const { setupBeatportTracks, teardownTracks } = require('../../../lib/tracks.js')
const { updateDates } = require('../../../lib/fixture-utils.js')
const { searchForTracks } = require('../../../../routes/shared/db/search.js')
const assert = require('assert')
const { test } = require('cascade-test')
const sql = require('sql-template-strings')
const { resolveTestUserId } = require('../../../lib/test-user')

const concussionFixture = require('../../../fixtures/noisia_concussion_beatport.json')
const purposeFixture = require('../../../fixtures/noisia_purpose_beatport.json')

// Fixture with a different artist (id/slug changed to force a new artist record in DB)
const otherArtistFixture = R.pipe(
  L.modify(L.query(['data', 'id']), R.always(99999)),
  L.modify(L.query('isrc'), R.always('OTHR000001')),
  L.modify(L.query('catalog_number'), R.always('OTHR001')),
  L.modify([L.query('release'), 'id'], R.always(99999)),
  L.modify(L.query('artists'), (artists) =>
    artists.map((a) => ({ ...a, id: 99999, name: 'Other Artist', slug: 'other-artist' })),
  ),
)(concussionFixture)

const updateDatesToToday = updateDates()

const getTrackArtistId = async (trackIds) => {
  const [{ artistId }] = await pg.queryRowsAsync(
    sql`SELECT MIN(artist_id) AS "artistId" FROM track NATURAL JOIN track__artist WHERE track_id = ANY(${trackIds})`,
  )
  return artistId
}

const getTrackLabelId = async (trackIds) => {
  const [{ labelId }] = await pg.queryRowsAsync(
    sql`SELECT MIN(label_id) AS "labelId" FROM track NATURAL JOIN track__label WHERE track_id = ANY(${trackIds})`,
  )
  return labelId
}

test({
  setup: async () => {
    await initDb()
    return { userId: await resolveTestUserId() }
  },

  'when a track is added': {
    setup: async ({ userId }) => {
      const result = await setupBeatportTracks([{ tracks: updateDatesToToday(concussionFixture) }], false, [userId])
      const artistId = await getTrackArtistId(result.addedTracks)
      const labelId = await getTrackLabelId(result.addedTracks)
      return { ...result, userId, artistId, labelId }
    },
    teardown: teardownTracks,

    'text search finds the track': async ({ userId }) => {
      const results = await searchForTracks('concussion', { userId })
      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].title, 'Concussion')
    },
    'artist filter returns the track': async ({ artistId, userId }) => {
      const results = await searchForTracks(`artist:${artistId}`, { userId })
      assert.strictEqual(results.length, 1)
    },
    'label filter returns the track': async ({ labelId, userId }) => {
      const results = await searchForTracks(`label:${labelId}`, { userId })
      assert.strictEqual(results.length, 1)
    },
  },

  'when two tracks by the same artist are added': {
    setup: async ({ userId }) => {
      const result = await setupBeatportTracks([
        { tracks: updateDatesToToday(concussionFixture) },
        { tracks: updateDatesToToday(purposeFixture) },
      ], false, [userId])
      const artistId = await getTrackArtistId(result.addedTracks)
      const labelId = await getTrackLabelId(result.addedTracks)
      return { ...result, userId, artistId, labelId }
    },
    teardown: teardownTracks,

    'artist filter returns both tracks': async ({ artistId, userId }) => {
      const results = await searchForTracks(`artist:${artistId}`, { userId })
      assert.strictEqual(results.length, 2)
    },
    'label filter returns both tracks': async ({ labelId, userId }) => {
      const results = await searchForTracks(`label:${labelId}`, { userId })
      assert.strictEqual(results.length, 2)
    },
    'artist filter combined with text is AND': async ({ artistId, userId }) => {
      const results = await searchForTracks(`artist:${artistId} concussion`, { userId })
      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].title, 'Concussion')
    },
    'label filter combined with text is AND': async ({ labelId, userId }) => {
      const results = await searchForTracks(`label:${labelId} concussion`, { userId })
      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].title, 'Concussion')
    },
    'artist name is not matched by text when filtering by artist id': async ({ artistId, userId }) => {
      // "noisia" appears only in the artist_name field; when filtering by artist:id the artist
      // names are excluded from the text tsvector, so no tracks should match
      const results = await searchForTracks(`artist:${artistId} noisia`, { userId })
      assert.strictEqual(results.length, 0)
    },
    'label name is not matched by text when filtering by label id': async ({ labelId, userId }) => {
      // "vision" appears only in label_name; when filtering by label:id label names are
      // excluded from the text tsvector, so no tracks should match
      const results = await searchForTracks(`label:${labelId} vision`, { userId })
      assert.strictEqual(results.length, 0)
    },
    'artist and label filters combined return tracks satisfying both': async ({ artistId, labelId, userId }) => {
      const results = await searchForTracks(`artist:${artistId} label:${labelId}`, { userId })
      assert.strictEqual(results.length, 2)
    },
  },

  'when tracks by two different artists are added': {
    setup: async ({ userId }) => {
      const noisiaResult = await setupBeatportTracks([{ tracks: updateDatesToToday(concussionFixture) }], false, [userId])
      const otherResult = await setupBeatportTracks([{ tracks: updateDatesToToday(otherArtistFixture) }], false, [userId])
      const noisiaArtistId = await getTrackArtistId(noisiaResult.addedTracks)
      return {
        addedTracks: [...noisiaResult.addedTracks, ...otherResult.addedTracks],
        addedSources: [...noisiaResult.addedSources, ...otherResult.addedSources],
        userId,
        noisiaArtistId,
      }
    },
    teardown: teardownTracks,

    'text search returns all tracks matching the title': async ({ userId }) => {
      const results = await searchForTracks('concussion', { userId })
      assert.strictEqual(results.length, 2)
    },
    'artist filter returns only that artist tracks': async ({ noisiaArtistId, userId }) => {
      const results = await searchForTracks(`artist:${noisiaArtistId}`, { userId })
      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].title, 'Concussion')
    },
    'artist filter combined with title text is AND': async ({ noisiaArtistId, userId }) => {
      const results = await searchForTracks(`artist:${noisiaArtistId} concussion`, { userId })
      assert.strictEqual(results.length, 1)
    },
  },

  teardown: async () => {
    spotifyInterceptor.dispose()
  },
})

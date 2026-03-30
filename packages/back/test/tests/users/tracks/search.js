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

const concussionFixture = require('../../../fixtures/noisia_concussion_beatport.json')
const purposeFixture = require('../../../fixtures/noisia_purpose_beatport.json')

// Fixture with a different artist (id/slug changed to force a new artist record in DB)
const otherArtistFixture = R.pipe(
  L.modify(L.query(['data', 'id']), R.always(99999)),
  L.modify(L.query('isrc'), R.always('OTHR000001')),
  L.modify(L.query('catalog_number'), R.always('OTHR001')),
  L.modify([L.query('release'), 'id'], R.always(99999)),
  L.modify([L.query('genre')], R.always({ id: 99999, name: 'Other Genre', slug: 'other-genre' })),
  L.modify([L.query('label')], R.always({ id: 99999, name: 'Other Label', slug: 'other-label' })),
  L.modify([L.query('bpm')], R.always(100)),
  L.modify([L.query('key')], R.always({ "camelot_number": 7, "camelot_letter": "B", "chord_type": { "id": 2, "name": "Major", "url": "https://api-internal.beatportprod.com/v4/catalog/chord-types/2/" } })),
  L.modify(L.query('artists'), (artists) =>
    artists.map((a) => ({ ...a, id: 99999, name: 'Other Artist', slug: 'other-artist' })),
  ),
)(concussionFixture)

const updateDatesToToday = updateDates()

const userId = 1

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

const getTrackGenreId = async (trackIds) => {
  const [{ genreId }] = await pg.queryRowsAsync(
    sql`SELECT MIN(genre_id) AS "genreId" FROM track NATURAL JOIN track__genre WHERE track_id = ANY(${trackIds})`,
  )
  return genreId
}

const trackRowArtists = (row) => {
  const raw = row.artists
  return typeof raw === 'string' ? JSON.parse(raw) : raw
}

test({
  setup: async () => {
    await initDb()
  },


  'when two tracks by the same artist are added': {
    setup: async () => {
      const result = await setupBeatportTracks([
        { tracks: updateDatesToToday(concussionFixture) },
        { tracks: updateDatesToToday(purposeFixture) },
      ])
      const artistId = await getTrackArtistId(result.addedTracks)
      const labelId = await getTrackLabelId(result.addedTracks)
      return { ...result, artistId, labelId }
    },
    teardown: teardownTracks,

    'artist filter returns both tracks': async ({ artistId }) => {
      const results = await searchForTracks(`artist:${artistId}`, { userId })
      assert.strictEqual(results.length, 2)
    },
    'label filter returns both tracks': async ({ labelId }) => {
      const results = await searchForTracks(`label:${labelId}`, { userId })
      assert.strictEqual(results.length, 2)
    },
    'artist filter combined with text is AND': async ({ artistId }) => {
      const results = await searchForTracks(`artist:${artistId} concussion`, { userId })
      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].title, 'Concussion')
    },
    'label filter combined with text is AND': async ({ labelId }) => {
      const results = await searchForTracks(`label:${labelId} concussion`, { userId })
      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].title, 'Concussion')
    },
    'artist name is not matched by text when filtering by artist id': async ({ artistId }) => {
      // "noisia" appears only in the artist_name field; when filtering by artist:id the artist
      // names are excluded from the text tsvector, so no tracks should match
      const results = await searchForTracks(`artist:${artistId} noisia`, { userId })
      assert.strictEqual(results.length, 0)
    },
    'label name is not matched by text when filtering by label id': async ({ labelId }) => {
      // "vision" appears only in label_name; when filtering by label:id label names are
      // excluded from the text tsvector, so no tracks should match
      const results = await searchForTracks(`label:${labelId} vision`, { userId })
      assert.strictEqual(results.length, 0)
    },
    'artist and label filters combined return tracks satisfying both': async ({ artistId, labelId }) => {
      const results = await searchForTracks(`artist:${artistId} label:${labelId}`, { userId })
      assert.strictEqual(results.length, 2)
    },
  },

  'when tracks by two different artists are added': {
    setup: async () => {
      const noisiaResult = await setupBeatportTracks([{ tracks: updateDatesToToday(concussionFixture) }])
      const otherResult = await setupBeatportTracks([{ tracks: updateDatesToToday(otherArtistFixture) }])

      const noisiaGenreId = await getTrackGenreId(noisiaResult.addedTracks)
      const noisiaArtistId = await getTrackArtistId(noisiaResult.addedTracks)
      const noisiaLabelId = await getTrackLabelId(noisiaResult.addedTracks)

      const otherGenreId = await getTrackGenreId(otherResult.addedTracks)
      const otherArtistId = await getTrackArtistId(otherResult.addedTracks)
      const otherLabelId = await getTrackLabelId(otherResult.addedTracks)

      return {
        noisiaGenreId,
        noisiaArtistId,
        noisiaLabelId,
        otherGenreId,
        otherArtistId,
        otherLabelId,
      }
    },
    teardown: teardownTracks,

    'artist filter returns the track': async ({ noisiaArtistId }) => {
      const results = await searchForTracks(`artist:${noisiaArtistId}`, { userId })
      assert.strictEqual(results.length, 1)
    },
    'label filter returns the track': async ({ noisiaLabelId }) => {
      const results = await searchForTracks(`label:${noisiaLabelId}`, { userId })
      assert.strictEqual(results.length, 1)
    },
    'genre filter returns the correct track': async ({ noisiaGenreId }) => {
      const results = await searchForTracks(`genre:${noisiaGenreId}`, { userId })
      //console.log(JSON.stringify(results, null, 2))
      assert.strictEqual(results.length, 1)
    },
    'duplicate genre filters keep the first genre only': async ({ noisiaGenreId, otherGenreId }) => {
      const results = await searchForTracks(`genre:${noisiaGenreId} genre:${otherGenreId} concussion`, { userId })
      assert.strictEqual(results.length, 1)
    },
    'duplicate label filters keep the first label only': async ({ noisiaLabelId, otherLabelId }) => {
      const results = await searchForTracks(`label:${noisiaLabelId} label:${otherLabelId} concussion`, { userId })
      assert.strictEqual(results.length, 1)
    },
    'duplicate bpm filters keep the first bpm only': async () => {
      const results = await searchForTracks(`bpm:86 bpm:200 concussion`, { userId })
      //console.log(JSON.stringify(results, null, 2))
      assert.strictEqual(results.length, 1)
    },
    'text search returns all tracks matching the title': async () => {
      const results = await searchForTracks('concussion', { userId })
      assert.strictEqual(results.length, 2)
      assert.ok(results.every((r) => r.title === 'Concussion'))
      const authorNames = results
        .flatMap((r) => trackRowArtists(r).map((a) => a.name))
        .sort()
      assert.deepStrictEqual(authorNames, ['Noisia', 'Other Artist'])
    },
    'artist filter returns only that artist tracks': async ({ noisiaArtistId }) => {
      const results = await searchForTracks(`artist:${noisiaArtistId}`, { userId })
      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].title, 'Concussion')
      const authors = trackRowArtists(results[0])
      assert.deepStrictEqual(
        authors.map((a) => a.name),
        ['Noisia'],
      )
    },
    'artist filter combined with title text is AND': async ({ noisiaArtistId }) => {
      const results = await searchForTracks(`artist:${noisiaArtistId} concussion`, { userId })
      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].title, 'Concussion')
      assert.deepStrictEqual(
        trackRowArtists(results[0]).map((a) => a.name),
        ['Noisia'],
      )
    },
    'multiple artist filters match only tracks with all listed artists': async ({ noisiaArtistId, otherArtistId }) => {
      const results = await searchForTracks(`artist:${noisiaArtistId} artist:${otherArtistId}`, { userId })
      assert.strictEqual(results.length, 0)
    }
  },

  teardown: async () => {
    spotifyInterceptor.dispose()
  },
})

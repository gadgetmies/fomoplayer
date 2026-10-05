const assert = require('assert')
const { test } = require('cascade-test')
const sql = require('sql-template-strings')
const { initDb, pg } = require('../../lib/db.js')
const { addBandcampTracks } = require('../../lib/tracks.js')
const { resolveTestUserId } = require('../../lib/test-user')
const { repairBandcampArtistlessTracks } = require('../../../scripts/repair-bandcamp-artistless-tracks')
const resonanceVITracks = require('../../fixtures/bandcamp-resonance-vi-tracks.json')

const releaseUrl = resonanceVITracks[0].release.url
const storeTrackIds = resonanceVITracks.map(({ id }) => String(id))
const anomaly = String(resonanceVITracks.find(({ title }) => title === 'Anomaly').id)
const asteroids = String(resonanceVITracks.find(({ title }) => title === 'Asteroids').id)
const halcyon = String(resonanceVITracks.find(({ title }) => title === 'Halcyon').id)

// The release page as getRelease returns it, built from the stored fixture
const release = (trackinfo = resonanceVITracks.map(({ store_details }) => store_details)) => ({
  id: Number(resonanceVITracks[0].release.id),
  url: releaseUrl,
  artist: 'Noisia',
  album_release_date: resonanceVITracks[0].release.release_date,
  current: { title: 'The Resonance VI', publish_date: resonanceVITracks[0].published, release_date: null, band_id: 1 },
  pageType: 'artist',
  pageName: 'Noisia',
  trackinfo,
})

const queryCredits = async (storeTrackId) =>
  (
    await pg.queryRowsAsync(sql`
SELECT artist_name || ':' || track__artist_role AS credit
FROM store__track NATURAL JOIN track__artist NATURAL JOIN artist
WHERE store__track_store_id = ${storeTrackId}
ORDER BY track__artist_role, artist_name`)
  ).map(({ credit }) => credit)

const queryDetailsArtists = async (storeTrackId) =>
  (
    await pg.queryRowsAsync(sql`
SELECT track_details->'artists' AS artists FROM track_details NATURAL JOIN store__track
WHERE store__track_store_id = ${storeTrackId}`)
  )[0].artists.map(({ name }) => name)

// What converting the page artist into a label leaves: every track but Halcyon without artists
const removeCredits = () =>
  pg.queryAsync(sql`
DELETE FROM track__artist
WHERE track_id IN (SELECT track_id FROM store__track
                   WHERE store__track_store_id = ANY (${storeTrackIds}) AND store__track_store_id <> ${halcyon})`)

const addSubdomainLabel = (name) =>
  pg.queryAsync(sql`
WITH l AS (INSERT INTO label (label_name) VALUES (${name}) RETURNING label_id)
INSERT INTO store__label (label_id, store_id, store__label_store_id, store__label_url)
SELECT label_id, (SELECT store_id FROM store WHERE store_name = 'Bandcamp'), 'noisia', 'https://noisia.bandcamp.com'
FROM l`)

const removeSubdomainLabel = () =>
  pg.queryAsync(sql`DELETE FROM store__label WHERE store__label_url = 'https://noisia.bandcamp.com'`)

const silent = () => {}

test({
  setup: async () => {
    await initDb()
    await addBandcampTracks(resonanceVITracks, [await resolveTestUserId()])
  },

  'a dry run writes nothing': async () => {
    await removeCredits()
    const summary = await repairBandcampArtistlessTracks({ getRelease: async () => release(), log: silent })
    assert.strictEqual(summary.candidates, 14)
    assert.strictEqual(summary.repaired, 0)
    assert.deepStrictEqual(await queryCredits(anomaly), [])
  },

  'credits the artist-less tracks from the re-fetched release': async () => {
    await removeCredits()
    const halcyonCredits = await queryCredits(halcyon)
    const summary = await repairBandcampArtistlessTracks({
      apply: true,
      getRelease: async () => release(),
      log: silent,
    })
    assert.strictEqual(summary.repaired, 14)
    assert.deepStrictEqual(await queryCredits(anomaly), ['Noisia:author', 'Annix:remixer'])
    assert.deepStrictEqual(await queryCredits(asteroids), ['Noisia:author', 'Prolix:author', 'Tsuruda:remixer'])
    assert.deepStrictEqual(await queryCredits(halcyon), halcyonCredits)
    assert.deepStrictEqual(await queryDetailsArtists(anomaly), ['Noisia'])
  },

  "on an artist's own page converted to a label, credits the artist": async () => {
    await removeCredits()
    await addSubdomainLabel('noisia')
    try {
      const summary = await repairBandcampArtistlessTracks({
        apply: true,
        getRelease: async () => release(),
        log: silent,
      })
      assert.strictEqual(summary.repaired, 14)
      assert.deepStrictEqual(await queryCredits(anomaly), ['Noisia:author', 'Annix:remixer'])
      assert.deepStrictEqual(await queryCredits(asteroids), ['Noisia:author', 'Prolix:author', 'Tsuruda:remixer'])
    } finally {
      await removeSubdomainLabel()
    }
  },

  'on a label page, skips tracks that would only credit the label': async () => {
    await removeCredits()
    await addSubdomainLabel('Noisia Records')
    try {
      const summary = await repairBandcampArtistlessTracks({
        apply: true,
        getRelease: async () => ({ ...release(), artist: 'Noisia Records' }),
        log: silent,
      })
      assert.deepStrictEqual(await queryCredits(asteroids), ['Noisia:author', 'Prolix:author', 'Tsuruda:remixer'])
      assert.deepStrictEqual(await queryCredits(anomaly), [])
      assert.ok(summary.labelOnly.some(({ title }) => title === 'Anomaly'))
    } finally {
      await removeSubdomainLabel()
    }
  },

  'on a page stored as neither artist nor label, skips tracks naming only the page': async () => {
    await removeCredits()
    const moveArtistUrl = (from, to) =>
      pg.queryAsync(sql`UPDATE store__artist SET store__artist_url = ${to} WHERE store__artist_url = ${from}`)
    await moveArtistUrl('https://noisia.bandcamp.com', 'https://noisia-moved.bandcamp.com')
    try {
      const summary = await repairBandcampArtistlessTracks({
        apply: true,
        getRelease: async () => ({ ...release(), artist: 'Noisia Records', pageName: 'Noisia Records' }),
        log: silent,
      })
      assert.deepStrictEqual(await queryCredits(anomaly), [])
      assert.ok(summary.labelOnly.some(({ title }) => title === 'Anomaly'))
      assert.deepStrictEqual(await queryCredits(asteroids), ['Noisia:author', 'Prolix:author', 'Tsuruda:remixer'])
    } finally {
      await moveArtistUrl('https://noisia-moved.bandcamp.com', 'https://noisia.bandcamp.com')
    }
  },

  'reports tracks no longer on the release and stops when rate limited': async () => {
    await removeCredits()
    const withoutAnomaly = release().trackinfo.filter(({ id }) => String(id) !== anomaly)
    const summary = await repairBandcampArtistlessTracks({
      getRelease: async () => release(withoutAnomaly),
      log: silent,
    })
    assert.deepStrictEqual(
      summary.missingFromRelease.map(({ title }) => title),
      ['Anomaly'],
    )

    const rateLimited = await repairBandcampArtistlessTracks({
      apply: true,
      getRelease: async () => {
        throw Object.assign(new Error('Too many requests'), { isRateLimit: true })
      },
      log: silent,
    })
    assert.strictEqual(rateLimited.rateLimited, true)
    assert.strictEqual(rateLimited.repaired, 0)
  },

  teardown: async () => {
    // Label-page artists have no store id, which the schema reset's down migrations do not allow
    await pg.queryAsync(sql`DELETE FROM store__artist WHERE store__artist_store_id IS NULL`)
    await initDb()
  },
})

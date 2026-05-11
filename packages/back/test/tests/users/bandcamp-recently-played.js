const assert = require('assert')
const { test } = require('cascade-test')

const { initDb } = require('../../lib/db')
const { resolveTestUserId } = require('../../lib/test-user')
const { addBandcampTracks, teardownTracks } = require('../../lib/tracks')
const { queryUserTracks, setTrackHeard } = require('../../../routes/users/db')

const bandcampTrack = (label) => ({
  id: `bp-fixture-${label}`,
  url: `https://example.bandcamp.com/track/${label}`,
  title: `recently-played fixture ${label}`,
  version: null,
  duration_ms: 200000,
  released: '2026-04-01T12:00:00Z',
  published: '2026-04-01T12:00:00Z',
  track_number: 1,
  isrc: null,
  artists: [
    {
      name: `recently-played artist ${label}`,
      role: 'author',
      id: `artist-${label}`,
      url: `https://${label}.bandcamp.com`,
    },
  ],
  release: {
    id: `release-${label}`,
    url: `https://example.bandcamp.com/album/${label}`,
    title: `recently-played release ${label}`,
    release_date: '2026-04-01T12:00:00Z',
    catalog_number: null,
    isrc: null,
  },
  previews: [
    { format: 'mp3', url: `https://example.bandcamp.com/preview/${label}.mp3`, start_ms: 0, end_ms: 200000 },
  ],
})

const fetchHeardBucket = (userId) =>
  queryUserTracks(userId, ['bandcamp'], { new: 0, recent: 0, heard: 20 }, { new: 0, recent: 0, heard: 0 })

const findHeardEntry = (result, trackId) =>
  (result?.tracks?.heard || []).find((t) => Number(t.id) === Number(trackId))

test({
  setup: async () => {
    await initDb()
    const userId = await resolveTestUserId()

    const seed = await addBandcampTracks([bandcampTrack('A'), bandcampTrack('B')], [userId])
    const [trackA, trackB] = seed.addedTracks

    return {
      userId,
      trackA,
      trackB,
      addedTracks: seed.addedTracks,
      addedSources: [seed.sourceId],
    }
  },

  teardown: async (ctx) => {
    await teardownTracks(ctx)
  },

  'setTrackHeard surfaces a Bandcamp track in the heard bucket': async ({ userId, trackA }) => {
    await setTrackHeard(trackA, userId, true)
    const entry = findHeardEntry(await fetchHeardBucket(userId), trackA)
    assert.ok(entry, 'Bandcamp track A must appear in heard bucket after setTrackHeard')
    assert.ok(entry.heard, 'heard timestamp must be set')
    await setTrackHeard(trackA, userId, false)
  },

  'heard bucket sorts most-recent first': async ({ userId, trackA, trackB }) => {
    await setTrackHeard(trackA, userId, true)
    await new Promise((r) => setTimeout(r, 25))
    await setTrackHeard(trackB, userId, true)
    const heardIds = (await fetchHeardBucket(userId)).tracks.heard.map((t) => Number(t.id))
    const positionA = heardIds.indexOf(Number(trackA))
    const positionB = heardIds.indexOf(Number(trackB))
    assert.ok(positionA >= 0, 'track A must be in heard bucket')
    assert.ok(positionB >= 0, 'track B must be in heard bucket')
    assert.ok(
      positionB < positionA,
      `track B (heard later) must sort before track A; got positions A=${positionA}, B=${positionB}`,
    )
    await setTrackHeard(trackA, userId, false)
    await setTrackHeard(trackB, userId, false)
  },

  're-marking an already-heard track updates the timestamp and moves it to the top': async ({
    userId,
    trackA,
    trackB,
  }) => {
    await setTrackHeard(trackA, userId, true)
    await new Promise((r) => setTimeout(r, 25))
    await setTrackHeard(trackB, userId, true)

    const initial = await fetchHeardBucket(userId)
    const initialHeardIds = initial.tracks.heard.map((t) => Number(t.id))
    assert.strictEqual(initialHeardIds.indexOf(Number(trackB)), 0, 'B starts at top')

    const beforeReheard = findHeardEntry(initial, trackA).heard
    await new Promise((r) => setTimeout(r, 25))
    await setTrackHeard(trackA, userId, true)

    const after = await fetchHeardBucket(userId)
    const afterHeardIds = after.tracks.heard.map((t) => Number(t.id))
    assert.strictEqual(
      afterHeardIds.indexOf(Number(trackA)),
      0,
      `re-heard track A must move to top of bucket; got order ${afterHeardIds.join(',')}`,
    )
    const afterReheard = findHeardEntry(after, trackA).heard
    assert.ok(
      new Date(afterReheard).getTime() > new Date(beforeReheard).getTime(),
      `re-heard timestamp must advance: before=${beforeReheard} after=${afterReheard}`,
    )

    await setTrackHeard(trackA, userId, false)
    await setTrackHeard(trackB, userId, false)
  },
})

const { setupBeatportTracks } = require('./tracks')
const { getBrowserContext } = require('./setup')
const { beatportTracksTransform } = require('../../../browser-extension/src/js/transforms/beatport')
const { storeUrl: beatportUrl } = require('../../routes/stores/beatport/logic')

const firstTrack = require('../fixtures/noisia_concussion_beatport.json')
const secondTrack = require('../fixtures/noisia_purpose_beatport.json')
const thirdTrack = require('../fixtures/noisia_purpose_remix_beatport.json')
const fourthTrack = require('../fixtures/beatport_operator_track_pageprops.json')
const fifthTrack = require('../fixtures/beatport_dub_power_track_pageprops.json')
const sixthTrack = require('../fixtures/noisia_block_control_beatport.json')

const seedFixtures = [firstTrack, secondTrack, thirdTrack, fourthTrack, fifthTrack, sixthTrack]
const transformedSeedTracks = seedFixtures.flatMap((fixture) => beatportTracksTransform(fixture))
const seededTrackIds = Array.from(new Set(transformedSeedTracks.map(({ id }) => id).filter(Boolean)))
const seededTrackTitles = transformedSeedTracks.map(({ title }) => title).filter(Boolean)
const seededTrackArtists = Array.from(
  new Set(
    transformedSeedTracks.flatMap(({ artists = [] }) =>
      artists
        .filter(({ role }) => role === 'author')
        .map(({ name }) => name)
        .filter(Boolean),
    ),
  ),
)

const isRemotePreview = Boolean(process.env.PREVIEW_URL)

module.exports.seedTracks = async ({ userIds }) => {
  if (isRemotePreview) {
    // In remote preview mode the bot user is the only test user; we seed via
    // the existing POST /api/me/tracks endpoint (same path as the Chrome ext).
    const ctx = getBrowserContext()
    const tracks = seedFixtures.flatMap((fixture) => beatportTracksTransform(fixture))
    const res = await ctx.request.post(`${process.env.PREVIEW_URL}/api/me/tracks`, {
      data: tracks,
      headers: { 'x-multi-store-player-store': beatportUrl },
    })
    if (!res.ok()) throw new Error(`Seeding tracks failed: HTTP ${res.status()} — ${await res.text()}`)
    return { addedTracks: [], addedSources: [] }
  }

  return setupBeatportTracks(seedFixtures.map((tracks) => ({ tracks })), false, userIds)
}

module.exports.seededTrackAssertions = {
  ids: seededTrackIds,
  titles: seededTrackTitles,
  artists: seededTrackArtists,
}

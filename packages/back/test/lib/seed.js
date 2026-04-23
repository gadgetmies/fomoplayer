const { setupBeatportTracks } = require('./tracks')
const firstTrack = require('../fixtures/noisia_concussion_beatport.json')
const secondTrack = require('../fixtures/noisia_purpose_beatport.json')
const thirdTrack = require('../fixtures/noisia_purpose_remix_beatport.json')
const fourthTrack = require('../fixtures/beatport_operator_track_pageprops.json')
const fifthTrack = require('../fixtures/beatport_dub_power_track_pageprops.json')
const sixthTrack = require('../fixtures/noisia_block_control_beatport.json')
const { beatportTracksTransform } = require('../../../chrome-extension/src/js/transforms/beatport')

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

module.exports.seedTracks = async ({ userIds }) => {
  return setupBeatportTracks(seedFixtures.map((tracks) => ({ tracks })), false, userIds)
}

module.exports.seededTrackAssertions = {
  ids: seededTrackIds,
  titles: seededTrackTitles,
  artists: seededTrackArtists,
}

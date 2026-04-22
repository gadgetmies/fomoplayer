const { setupBeatportTracks } = require('./tracks')
const firstTrack = require('../fixtures/noisia_concussion_beatport.json')
const secondTrack = require('../fixtures/noisia_purpose_beatport.json')
const { beatportTracksTransform } = require('../../../chrome-extension/src/js/transforms/beatport')

const transformedSeedTracks = [...beatportTracksTransform(firstTrack), ...beatportTracksTransform(secondTrack)]
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
  return setupBeatportTracks([{ tracks: firstTrack }, { tracks: secondTrack }], false, userIds)
}

module.exports.seededTrackAssertions = {
  titles: seededTrackTitles,
  artists: seededTrackArtists,
}

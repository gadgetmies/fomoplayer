const sql = require('sql-template-strings')
const { removeSources } = require('./sources')
const { pg } = require('./db')
const { insertSource } = require('../../jobs/watches/shared/db')
const { storeUrl: beatportUrl } = require('../../routes/stores/beatport/logic.js')
const { addStoreTracksToUsers } = require('../../routes/shared/tracks.js')
const { queryArtistsForTracks, removeArtists } = require('./artists.js')
const { queryReleasesForTracks, removeReleases } = require('./releases')
const { queryLabelsForTracks, removeLabels } = require('./labels')
const {
  beatportTracksTransform,
  beatportLibraryTransform
} = require('../../../chrome-extension/src/js/transforms/beatport.js')

const userId = 1

const addTracks = (module.exports.addTracks = async (tracks, type = 'new') => {
  const sourceId = await insertSource({
    operation: 'tracksHandlerTest',
    type: 'new',
    storeUrl: beatportUrl
  })
  const addedTracks = await addStoreTracksToUsers(beatportUrl, tracks, [userId], type, sourceId)

  return {
    sourceId,
    addedTracks
  }
})

const addNewBeatportTracksToDb = (module.exports.addNewBeatportTracksToDb = async tracks =>
  await addTracks(beatportTracksTransform(tracks)))

const addPurchasedBeatportTracksToDb = (module.exports.addPurchasedBeatportTracksToDb = async tracks =>
  await addTracks(beatportLibraryTransform(tracks), 'purchased'))

const removeTracks = (module.exports.removeTracks = async trackIds =>
  await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`
DELETE from track WHERE track_id = ANY(${trackIds})
`
  ))

module.exports.setupTracks = async (...trackBatches) => {
  let addedSources = []
  let addedTracksAgg = []

  for (const { type = 'new', tracks } of trackBatches) {
    const { sourceId, addedTracks } = await (type === 'new'
      ? addNewBeatportTracksToDb
      : addPurchasedBeatportTracksToDb)(tracks)
    addedSources.push(sourceId)
    addedTracksAgg = [...addedTracksAgg, ...addedTracks]
  }

  return {
    addedTracks: addedTracksAgg,
    addedSources
  }
}

module.exports.teardownTracks = async ({ addedTracks, addedSources }) => {
  const addedTrackIds = addedTracks.map(url => url.substring(url.lastIndexOf('/') + 1))
  const [{ artistIds }] = await queryArtistsForTracks(addedTrackIds)
  const [{ labelIds }] = await queryLabelsForTracks(addedTrackIds)
  const [{ releaseIds }] = await queryReleasesForTracks(addedTrackIds)
  await removeTracks(addedTrackIds)
  await removeArtists(artistIds)
  await removeLabels(labelIds)
  await removeReleases(releaseIds)
  await removeSources(addedSources)
}

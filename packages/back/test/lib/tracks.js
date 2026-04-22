const sql = require('sql-template-strings')
const { removeSources } = require('./sources')
const { pg } = require('./db')
const { insertSource } = require('../../jobs/watches/shared/db')
const { storeUrl: beatportUrl } = require('../../routes/stores/beatport/logic.js')
const { storeUrl: spotifyUrl } = require('../../routes/stores/spotify/logic.js')
const { addStoreTracksToUsers } = require('../../routes/shared/tracks.js')
const { queryArtistsForTracks, removeArtists } = require('./artists.js')
const { queryReleasesForTracks, removeReleases } = require('./releases')
const { queryLabelsForTracks, removeLabels } = require('./labels')
const {
  beatportTracksTransform,
  beatportLibraryTransform,
} = require('../../../chrome-extension/src/js/transforms/beatport.js')
const { spotifyTracksTransform } = require('fomoplayer_chrome_extension/src/js/transforms/spotify')

const addBeatportTracks = (module.exports.addTracks = async (tracks, skipOld, type = 'new', userIds) => {
  const sourceId = await insertSource({
    operation: 'tracksHandlerTest',
    type: 'new',
    storeUrl: beatportUrl,
  })
  const addedTracks = await addStoreTracksToUsers(beatportUrl, tracks, userIds, sourceId, skipOld, type)

  return {
    sourceId,
    addedTracks,
  }
})

const addSpotifyTracks = (module.exports.addTracks = async (tracks, skipOld, type = 'new', userIds) => {
  const sourceId = await insertSource({
    operation: 'tracksHandlerTest',
    type: 'new',
    storeUrl: spotifyUrl,
  })
  const addedTracks = await addStoreTracksToUsers(spotifyUrl, tracks, userIds, sourceId, skipOld, type)

  return {
    sourceId,
    addedTracks,
  }
})

const addNewBeatportTracksToDb = (module.exports.addNewBeatportTracksToDb = async (tracks, skipOld, userIds) =>
  await addBeatportTracks(beatportTracksTransform(tracks), skipOld, 'new', userIds))

const addPurchasedBeatportTracksToDb = (module.exports.addPurchasedBeatportTracksToDb = async (tracks, userIds) =>
  await addBeatportTracks(beatportLibraryTransform(tracks), false, 'purchased', userIds))

const removeTracks = (module.exports.removeTracks = async (trackIds) =>
  await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`
DELETE from track WHERE track_id = ANY(${trackIds})
`,
  ))

module.exports.addNewSpotifyTracksToDb = async (tracks, skipOld = false, userIds) => {
  const sourceId = await insertSource({
    operation: 'tracksHandlerTest',
    type: 'new',
    storeUrl: spotifyUrl,
  })
  const addedTracks = await addStoreTracksToUsers(
    spotifyUrl,
    spotifyTracksTransform(tracks),
    userIds,
    sourceId,
    skipOld,
  )

  return {
    sourceId,
    addedTracks,
  }
}

module.exports.setupBeatportTracks = async (trackBatches, skipOld = false, userIds) => {
  let addedSources = []
  let addedTracksAgg = []

  for (const { type = 'new', tracks } of trackBatches) {
    const { sourceId, addedTracks } = await (
      type === 'new'
        ? (tracks) => addNewBeatportTracksToDb(tracks, skipOld, userIds)
        : (tracks) => addPurchasedBeatportTracksToDb(tracks, userIds)
    )(tracks)
    addedSources.push(sourceId)
    addedTracksAgg = [...addedTracksAgg, ...addedTracks]
  }

  return {
    addedTracks: addedTracksAgg,
    addedSources,
  }
}

module.exports.teardownTracks = async ({ addedTracks, addedSources }) => {
  const [{ artistIds }] = await queryArtistsForTracks(addedTracks)
  const [{ labelIds }] = await queryLabelsForTracks(addedTracks)
  const [{ releaseIds }] = await queryReleasesForTracks(addedTracks)
  await removeTracks(addedTracks)
  await removeArtists(artistIds)
  await removeLabels(labelIds)
  await removeReleases(releaseIds)
  await removeSources(addedSources)
}

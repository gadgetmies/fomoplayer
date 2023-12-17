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
  beatportLibraryTransform
} = require('../../../chrome-extension/src/js/transforms/beatport.js')
const { spotifyTracksTransform } = require('fomoplayer_chrome_extension/src/js/transforms/spotify')

const userId = 1

const addBeatportTracks = (module.exports.addTracks = async (tracks, skipOld, type = 'new') => {
  const sourceId = await insertSource({
    operation: 'tracksHandlerTest',
    type: 'new',
    storeUrl: beatportUrl
  })
  const addedTracks = await addStoreTracksToUsers(beatportUrl, tracks, [userId], sourceId, skipOld, type)

  return {
    sourceId,
    addedTracks
  }
})

const addSpotifyTracks = (module.exports.addTracks = async (tracks, skipOld, type = 'new') => {
  const sourceId = await insertSource({
    operation: 'tracksHandlerTest',
    type: 'new',
    storeUrl: spotifyUrl
  })
  const addedTracks = await addStoreTracksToUsers(spotifyUrl, tracks, [userId], sourceId, skipOld, type)

  return {
    sourceId,
    addedTracks
  }
})

const addNewBeatportTracksToDb = (module.exports.addNewBeatportTracksToDb = async (tracks, skipOld) =>
  await addBeatportTracks(beatportTracksTransform(tracks), skipOld))

const addPurchasedBeatportTracksToDb = (module.exports.addPurchasedBeatportTracksToDb = async tracks =>
  await addBeatportTracks(beatportLibraryTransform(tracks), false, 'purchased'))

const removeTracks = (module.exports.removeTracks = async trackIds =>
  await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`
DELETE from track WHERE track_id = ANY(${trackIds})
`
  ))

module.exports.addNewSpotifyTracksToDb = async (tracks, skipOld = false) => {
  const sourceId = await insertSource({
    operation: 'tracksHandlerTest',
    type: 'new',
    storeUrl: spotifyUrl
  })
  const addedTracks = await addStoreTracksToUsers(
    spotifyUrl,
    spotifyTracksTransform(tracks),
    [userId],
    sourceId,
    skipOld
  )

  return {
    sourceId,
    addedTracks
  }
}

module.exports.setupBeatportTracks = async (trackBatches, skipOld = false) => {
  let addedSources = []
  let addedTracksAgg = []

  for (const { type = 'new', tracks } of trackBatches) {
    const { sourceId, addedTracks } = await (type === 'new'
      ? tracks => addNewBeatportTracksToDb(tracks, skipOld)
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
  const [{ artistIds }] = await queryArtistsForTracks(addedTracks)
  const [{ labelIds }] = await queryLabelsForTracks(addedTracks)
  const [{ releaseIds }] = await queryReleasesForTracks(addedTracks)
  await removeTracks(addedTracks)
  await removeArtists(artistIds)
  await removeLabels(labelIds)
  await removeReleases(releaseIds)
  await removeSources(addedSources)
}

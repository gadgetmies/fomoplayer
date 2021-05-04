const R = require('ramda')
const BPromise = require('bluebird')
const bpApi = require('bp-api')

const { beatportTracksTransform } = require('multi_store_player_chrome_extension/src/js/transforms/beatport')
const { queryStoreId, queryFollowRegexes } = require('../../shared/db/store.js')
const logger = require('../../../logger')(__filename)

const {
  insertArtist,
  insertStoreTracksToUser,
  insertTrackToLabel,
  findNewTracks,
  insertTrackPreview,
  insertTrackWaveform,
  insertStoreTrack,
  insertNewTrackReturningTrackId,
  insertPurchasedTracksByIds,
  ensureStoreLabelExists,
  ensureLabelExists,
  findNewLabels,
  insertStoreArtist,
  findNewArtists
} = require('./db.js')

const bpApiStatic = BPromise.promisifyAll(bpApi.staticFns)

let beatportSessions = {}
let beatportStoreDbId = null
// TODO: add export?
const storeName = (module.exports.storeName = 'Beatport')
module.exports.storeUrl = 'https://www.beatport.com'

module.exports.hasValidSession = username => Object.keys(beatportSessions).includes(username)

module.exports.getSession = username => beatportSessions[username]

module.exports.setSession = (username, session) => (beatportSessions[username] = session)

module.exports.deleteSession = username => {
  delete beatportSessions[username]
}

module.exports.getSessionForRequest = user => {
  // if (!user || !user.username) {
  //   throw new AccessDeniedError('Unable to find Beatport session for user')
  // }

  return beatportSessions[user.username]
}

const getBeatportStoreDbId = () => {
  if (beatportStoreDbId) {
    return BPromise.resolve(beatportStoreDbId)
  } else {
    return queryStoreId(storeName).then(store_id => {
      beatportStoreDbId = store_id
      return beatportStoreDbId
    })
  }
}

const insertDownloadedTracksToUser = (module.exports.insertDownloadedTracksToUser = (username, tracks) => {
  return BPromise.using(pg.getTransaction(), async tx => {
    const beatportStoreDbId = await getBeatportStoreDbId()
    const source = { operation: 'insertDownloadedTracksToUser' }
    const insertedNewTracks = await insertNewTracksToDb(tx, tracks, source)
    const addedTracks = await insertStoreTracksToUser(tx, username, tracks, source)
    // TODO: this should be done in the generic logic
    // for (const trackId of [...addedTracks, ...insertedNewTracks]) {
    //   await setTrackHeard(trackId, username, true) // TODO: destructure trackId from one of the arrays (currently returns an object)
    // }
    logger.info(`Inserted ${insertedNewTracks.length} new tracks to ${username} from downloaded tracks`)
    const insertedPurchasedTracks = await insertPurchasedTracksByIds(
      tx,
      beatportStoreDbId,
      username,
      R.pluck('id', tracks)
    )
    logger.info(`Inserted ${insertedPurchasedTracks.length} downloaded tracks to ${username}`)
  })
})

const insertNewTracksToDb = (tx, tracks, source) =>
  getBeatportStoreDbId().then(bpStoreId =>
    findNewTracks(tx, bpStoreId, tracks)
      .then(R.innerJoin(R.eqProps('id'), tracks))
      .then(async newTracks => {
        await ensureArtistsExist(tx, newTracks, bpStoreId, source)
        await ensureLabelsExist(tx, newTracks, bpStoreId, source)
        return await ensureTracksExist(tx, newTracks, bpStoreId, source)
      })
  )

const extractArtistsAndRemixers = R.pipe(R.chain(R.props(['artists', 'remixers'])), R.flatten, R.uniqBy(R.prop('id')))

// TODO: add exclude: {label: [], genre: [] } to store__artist (?)
// TODO: --> create new artist if excludes match the current track
const ensureArtistsExist = async (tx, newTracks, bpStoreId, source) =>
  BPromise.resolve(newTracks)
    .then(extractArtistsAndRemixers)
    .then(storeArtists =>
      findNewArtists(tx, bpStoreId, storeArtists)
        .then(R.innerJoin(R.eqProps('id'), storeArtists))
        .then(newStoreArtists =>
          BPromise.each(newStoreArtists, newStoreArtist =>
            insertArtist(tx, newStoreArtist.name, source).tap(() =>
              insertStoreArtist(tx, bpStoreId, newStoreArtist.name, newStoreArtist.id, source)
            )
          )
        )
    )

const ensureLabelsExist = async (tx, newStoreTracks, bpStoreId, source) =>
  BPromise.resolve(newStoreTracks)
    .map(R.prop('label'))
    .then(R.uniqBy(R.prop('id')))
    .then(storeLabels =>
      findNewLabels(tx, bpStoreId, storeLabels)
        .then(R.innerJoin(R.eqProps('id'), storeLabels))
        .then(newStoreLabels =>
          BPromise.each(newStoreLabels, newStoreLabel =>
            ensureLabelExists(tx, newStoreLabel.name, source).tap(() =>
              ensureStoreLabelExists(
                tx,
                bpStoreId,
                newStoreLabel.name,
                newStoreLabel.id,
                JSON.stringify(newStoreLabel),
                source
              )
            )
          )
        )
    )

const ensureTracksExist = async (tx, newStoreTracks, bpStoreId, source) =>
  BPromise.mapSeries(newStoreTracks, newStoreTrack =>
    insertNewTrackReturningTrackId(tx, newStoreTrack, source)
      .then(([{ track_id }]) => track_id)
      .tap(track_id => insertTrackToLabel(tx, track_id, newStoreTrack.label.id))
      .tap(track_id =>
        insertStoreTrack(tx, bpStoreId, track_id, newStoreTrack.id, newStoreTrack, source)
          .tap(([{ store__track_id }]) => insertTrackPreview(tx, store__track_id, newStoreTrack.preview, source))
          .tap(([{ store__track_id }]) => {
            const [
              {
                offset: { start, end }
              }
            ] = newStoreTrack.preview
            return insertTrackWaveform(tx, store__track_id, newStoreTrack.waveform, start, end, source)
          })
      )
  )

const getArtistName = (module.exports.getArtistName = async url => {
  const title = await bpApiStatic.getTitleAsync(url)
  return title.replace(' music download - Beatport', '')
})

const getLabelName = (module.exports.getLabelName = async url => {
  const title = await bpApiStatic.getTitleAsync(url)
  return title.replace(' artists & music download - Beatport', '')
})

module.exports.getPlaylistId = id => id

const getPlaylistName = (module.exports.getPlaylistName = async (type, url) => {
  return await bpApiStatic.getTitleAsync(url)
})

module.exports.getFollowDetails = async url => {
  const regexes = await queryFollowRegexes(storeName)
  const store = storeName.toLowerCase()
  let label

  for (const { regex, type } of regexes) {
    if (url.match(regex)) {
      if (type === 'artist') {
        label = await getArtistName(url)
      } else if (type === 'label') {
        label = await getLabelName(url)
      } else if (type === 'playlist') {
        label = await getPlaylistName(type, url)
      } else {
        throw new Error('URL did not match any regex')
      }

      return { label, type, store }
    }
  }

  return undefined
}

module.exports.getArtistTracks = async ({ artistStoreId }) => {
  const artistTracks = await bpApiStatic.getArtistTracksAsync(artistStoreId, 1)
  const transformed = beatportTracksTransform(artistTracks.tracks)
  if (transformed.length === 0) {
    const error = `No tracks found for artist ${artistStoreId}`
    logger.error(error)
    throw new Error(error)
  }

  return { tracks: transformed, errors: [] }
}

module.exports.getLabelTracks = async ({ labelStoreId }) => {
  const labelTracks = await bpApiStatic.getLabelTracksAsync(labelStoreId, 1)
  const transformed = beatportTracksTransform(labelTracks.tracks)
  if (transformed.length === 0) {
    const error = `No tracks found for label ${labelStoreId}`
    logger.error(error)
    throw new Error(error)
  }

  return { tracks: transformed, errors: [] }
}

module.exports.getPlaylistTracks = async function* ({ playlistStoreId: url }) {
  const playlist = await bpApiStatic.getTracksOnPageAsync(url)
  const transformed = beatportTracksTransform(playlist.tracks.tracks)
  if (transformed.length === 0) {
    const error = `No tracks found for playlist at ${url}`
    logger.error(error)
    throw new Error(error)
  }

  yield { tracks: transformed, errors: [] }
}

module.exports.test = {
  insertNewTracksToDb,
  insertDownloadedTracksToUser
}

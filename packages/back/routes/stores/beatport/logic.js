const R = require('ramda')
const BPromise = require('bluebird')
const bpApi = require('bp-api')

const pg = require('../../../db/pg.js')
const { BadRequest } = require('../../shared/httpErrors')
const { insertUserPlaylistFollow } = require('../../shared/db/user')
const { queryStoreId, queryFollowRegexes } = require('../../shared/db/store.js')
const { setTrackHeard } = require('../../logic.js')
const { log, error } = require('./logger')

const {
  insertArtist,
  addStoreTracksToUser,
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
const storeName = 'Beatport'

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
    const addedTracks = await addStoreTracksToUser(tx, username, tracks, source)
    for (const trackId of [...addedTracks, ...insertedNewTracks]) {
      await setTrackHeard(trackId, username, true) // TODO: destructure trackId from one of the arrays (currently returns an object)
    }
    log(`Inserted ${insertedNewTracks.length} new tracks to ${username} from downloaded tracks`)
    const insertedPurchasedTracks = await insertPurchasedTracksByIds(
      tx,
      beatportStoreDbId,
      username,
      R.pluck('id', tracks)
    )
    log(`Inserted ${insertedPurchasedTracks.length} downloaded tracks to ${username}`)
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
          .tap(([{ store__track_id }]) => insertTrackWaveform(tx, store__track_id, newStoreTrack.waveform, source))
      )
  )

module.exports.addPlaylistFollow = async (userId, playlistUrl) => {
  const title = await bpApiStatic.getTitleAsync(playlistUrl)

  if (!title) {
    throw new BadRequest('Unable to fetch details from url')
  }

  return await insertUserPlaylistFollow(userId, storeName, playlistUrl, title)
}

const getArtistName = (module.exports.getArtistName = async url => {
  const title = await bpApiStatic.getTitleAsync(url)
  return title.replace(' music download - Beatport', '')
})

const getLabelName = (module.exports.getLabelName = async url => {
  const title = await bpApiStatic.getTitleAsync(url)
  return title.replace(' artists & music download - Beatport', '')
})

const getPlaylistName = (module.exports.getPlaylistName = async (type, url) => {
  return await bpApiStatic.getTitleAsync(url)
})

module.exports.getFollowDetails = async url => {
  const regexes = await queryFollowRegexes(storeName)
  const store = storeName.toLowerCase()
  let label

  console.log(JSON.stringify({ regexes }, null, 2))

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

module.exports.test = {
  insertNewTracksToDb,
  insertDownloadedTracksToUser
}

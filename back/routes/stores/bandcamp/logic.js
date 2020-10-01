const R = require('ramda')
const BPromise = require('bluebird')
const using = BPromise.using
const pg = require('../../../db/pg.js')
const removeIgnoredTracksFromUser = require('../../../remove-ignored-tracks-from-user.js')
const { log, error } = require('./logger')
const { getOperation, createOperation } = require('../../../operations.js')
const { getAlbumAsync } = require('./bandcamp-api.js')

const {
  insertArtist,
  insertUserTrack,
  findNewTracks,
  insertTrackPreview,
  insertStoreTrack,
  insertNewTrackReturningTrackId,
  insertStoreArtist,
  isNewArtist,
  getStoreId,
  insertTrackToCart,
  queryTracksInCarts,
  addTracksToAlbum,
  queryAlbumUrl,
  ensureAlbumExists,
  queryTrackStoreId
} = require('./db.js')

let sessions = {}
let storeDbId = null

class SessionNotFoundError extends Error {
  constructor(...args) {
    super(...args)
  }
}

module.exports.errors = {
  SessionNotFoundError
}

module.exports.hasValidSession = username => Object.keys(sessions).includes(username)

let getSession = (module.exports.getSession = username => {
  if (!this.hasValidSession(username)) {
    throw new SessionNotFoundError(`Session not found for ${username}`)
  }
  return sessions[username]
})

module.exports.setSession = (username, session) => (sessions[username] = session)

module.exports.deleteSession = username => {
  delete sessions[username]
}

let fanIds = []
module.exports.setFanId = (username, fanId) => {
  fanIds[username] = fanId
}

let getFanId = (module.exports.getFanId = username => fanIds[username])

const getStoreDbId = () => {
  if (storeDbId) {
    return BPromise.resolve(storeDbId)
  } else {
    return getStoreId('Bandcamp').then(store_id => {
      storeDbId = store_id
      return storeDbId
    })
  }
}

const getStories = (module.exports.getStories = (username, since) =>
  getSession(username).getStoriesAsync(getFanId(username), since))

const getAlbum = (module.exports.getAlbum = (username, itemUrl) => getAlbum(itemUrl))

const addTracksFromAlbumToUser = (tx, username, album) =>
  insertNewAlbumTracksToDb(tx, album).then(insertedTrackIds =>
    BPromise.each(insertedTrackIds, insertedTrackId => insertUserTrack(tx, username, insertedTrackId)).tap(() =>
      removeIgnoredTracksFromUser(tx, username)
    )
  )

const getRefreshStatus = (module.exports.getRefreshStatus = (username, uuid) => getOperation(username, uuid))

const startRefreshUserTracks = (module.exports.startRefreshUserTracks = (
  username,
  since = Date.now(),
  fetchTimes = 10
) => {
  log(`Refreshing tracks from ${username}'s Bandcamp`)
  return createOperation('refresh-bandcamp', username, {}, () => refreshUserTracks(username, since, fetchTimes))
})

const refreshUserTracks = (module.exports.refreshUserTracks = (username, since = Date.now(), fetchTimes = 10) => {
  return getStories(username, since)
    .then(stories =>
      BPromise.mapSeries(stories.entries, story => getAlbum(username, story.item_url)).then(albums =>
        BPromise.using(pg.getTransaction(), async tx => {
          const storeId = await getStoreDbId()
          const insertedTracks = await BPromise.mapSeries(albums, async album => {
            const albumInDb = await ensureAlbumExists(tx, storeId, album)
            const insertedTracks = await addTracksFromAlbumToUser(tx, username, album)
            await addTracksToAlbum(tx, storeId, albumInDb, album.trackinfo.map(R.prop('track_id')))
            return insertedTracks
          }).then(R.flatten)

          log(`Inserted ${insertedTracks.length} new tracks to ${username}.\
 Remaining fetches: ${fetchTimes - 1}.`)
          return { insertedTracks, oldestStoryDate: stories.oldest_story_date }
        })
      )
    )
    .tap(({ oldestStoryDate }) => {
      if (fetchTimes === 1) {
        log(`Done refreshing tracks for ${username}.`)
        return BPromise.resolve()
      }
      return refreshUserTracks(username, oldestStoryDate, fetchTimes - 1)
    })
    .catch(e => {
      error(`Failed to insert tracks for user ${username}`, e)
      throw e
    })
})

const insertNewAlbumTracksToDb = (tx, album) =>
  getStoreDbId()
    .tap(storeId => ensureArtistExist(tx, album, storeId))
    .then(storeId => {
      const trackinfoWithCleanTitles = album.trackinfo.map(
        R.evolve({ title: title => title.replace(`${album.artist} - `, '') })
      )
      // Tracks without previews are of little use
      return (
        findNewTracks(tx, storeId, trackinfoWithCleanTitles.filter(R.propSatisfies(R.complement(R.isNil), ['file'])))
          // TODO: do this in db
          .then(R.innerJoin(({ track_id: t1 }, { track_id: t2 }) => t1 == t2, trackinfoWithCleanTitles))
          .then(R.uniqBy(R.prop('track_id')))
          .then(async newTracks => {
            //await ensureLabelsExist(tx, newTracks, storeId) // TODO: is this even necessary for Bandcamp stuff?
            return await ensureTracksExist(tx, album.current, newTracks, storeId).catch(e => {
              error('ensureTracksExist failed for', JSON.stringify(newTracks), e)
              return BPromise.reject(e)
            })
          })
      )
    })

// TODO: add exclude: {label: [], genre: [] } to store__artist (?)
// TODO: --> create new artist if excludes match the current track
const ensureArtistExist = async (tx, album, storeId) =>
  isNewArtist(tx, storeId, album.current.band_id).then(
    isNew =>
      isNew
        ? insertArtist(tx, album.artist).then(() =>
            insertStoreArtist(tx, storeId, album.artist, album.current.band_id, JSON.stringify(album.current))
          )
        : BPromise.resolve()
  )

const ensureTracksExist = async (tx, albumInfo, newStoreTracks, storeId) =>
  BPromise.mapSeries(newStoreTracks, newStoreTrack =>
    insertNewTrackReturningTrackId(tx, albumInfo, newStoreTrack)
      .then(([{ track_id }]) => track_id)
      // .tap(track_id => insertTrackToLabel(tx, track_id, newStoreTrack.label_id))
      .tap(track_id =>
        insertStoreTrack(tx, storeId, track_id, newStoreTrack.track_id, newStoreTrack).tap(([{ store__track_id }]) =>
          insertTrackPreview(tx, store__track_id, newStoreTrack)
        )
      )
  )

module.exports.addTrackToCart = (trackId, username, cart = 'default') => insertTrackToCart(trackId, cart, username)

module.exports.getTracksInCarts = queryTracksInCarts

// TODO: Update to use store__track_preview
module.exports.getPreviewUrl = async (username, id, format) => {
  const storeId = await getStoreDbId()
  const albumUrl = await queryAlbumUrl(storeId, id)
  const albumInfo = await getAlbumAsync(albumUrl)
  const trackStoreId = await queryTrackStoreId(id)
  return await albumInfo.trackinfo.find(R.propEq('track_id', parseInt(trackStoreId, 10))).file['mp3-128']
}

module.exports.test = {
  insertNewAlbumTracksToDb,
  addTracksFromAlbumToUser
}

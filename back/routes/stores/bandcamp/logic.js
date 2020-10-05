const R = require('ramda')
const BPromise = require('bluebird')
const { getAlbumAsync } = require('./bandcamp-api.js')

const {
  getStoreId,
  queryAlbumUrl,
  queryTrackStoreId
} = require('./db.js')

let storeDbId = null

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

const getAlbum = (module.exports.getAlbum = (username, itemUrl) => getAlbum(itemUrl))

// TODO: Update to use store__track_preview
module.exports.getPreviewUrl = async (username, id, format) => {
  const storeId = await getStoreDbId()
  const albumUrl = await queryAlbumUrl(storeId, id)
  const albumInfo = await getAlbumAsync(albumUrl)
  const trackStoreId = await queryTrackStoreId(id)
  return await albumInfo.trackinfo.find(R.propEq('track_id', parseInt(trackStoreId, 10))).file['mp3-128']
}

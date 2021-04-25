const R = require('ramda')
const BPromise = require('bluebird')
const { queryPreviewDetails } = require('../../shared/db/preview.js')
const { insertUserPlaylistFollow } = require('../../shared/db/user.js')
const { queryStoreId, queryFollowRegexes } = require('../../shared/db/store.js')
const {
  getReleaseAsync,
  getTagAsync,
  getArtistAsync,
  getLabelAsync,
  getPageDetailsAsync
} = require('./bandcamp-api.js')

const { queryAlbumUrl, queryTrackStoreId } = require('./db.js')

let storeDbId = null
const storeName = 'Bandcamp'

const getStoreDbId = () => {
  if (storeDbId) {
    return BPromise.resolve(storeDbId)
  } else {
    return queryStoreId(storeName).then(store_id => {
      storeDbId = store_id
      return storeDbId
    })
  }
}

module.exports.getPreviewDetails = async (previewId) => {
  const storeId = await getStoreDbId()
  const details = await queryPreviewDetails(previewId)
  const storeTrackId = details.store_track_id
  const albumUrl = await queryAlbumUrl(storeId, storeTrackId)
  const albumInfo = await getReleaseAsync(albumUrl)
  const url = await albumInfo.trackinfo.find(R.propEq('track_id', parseInt(storeTrackId, 10))).file['mp3-128']
  return {
    ...details,
    url: url
  }
}

const getTagFromUrl = function(playlistUrl) {
  const match = playlistUrl.match(/^https:\/\/bandcamp.com\/tag\/([^/?]+)/)
  return match[1]
}

module.exports.addPlaylistFollow = async (userId, playlistUrl, playlistType) => {
  let id
  let name
  if (playlistType === 'tag') {
    // TODO: fetch regex from db
    const tag = getTagFromUrl(playlistUrl)
    if (!tag) {
      throw new BadRequest('Invalid Bandcamp playlist URL')
    }

    const res = await getTagAsync(tag)
    id = res.id
    name = res.name

    if (!id || !name) {
      throw new BadRequest('Fetching playlist details failed')
    }
  }

  return await insertUserPlaylistFollow(userId, 'Bandcamp', id, name, playlistType)
}

module.exports.getArtistName = async url => {
  const { name } = await getArtistAsync(url)
  console.log(name)
  return name
}

module.exports.getLabelName = async url => {
  const { name } = await getLabelAsync(url)
  console.log(name)
  return name
}

const getPlaylistName = (module.exports.getPlaylistName = async (type, url) => {
  if (type === 'tag') {
    const res = await getTagAsync(getTagFromUrl(url))
    return res.name
  }
})

module.exports.getFollowDetails = async url => {
  const regexes = await queryFollowRegexes(storeName)
  const store = storeName.toLowerCase()
  for (const { regex, type } of regexes) {
    if (url.match(regex)) {
      if (['artist', 'label'].includes(type)) {
        const { name, type: pageType } = await getPageDetailsAsync(url)
        return { label: name, type: pageType, store }
      } else if (type === 'tag') {
        const label = await getPlaylistName(type, url)
        return { label: `Tag: ${label}`, type: 'playlist', store }
      } else {
        throw new Error('URL did not match any regex')
      }
    }
  }

  return undefined
}

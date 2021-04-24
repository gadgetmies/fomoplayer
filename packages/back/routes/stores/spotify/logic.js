const BPromise = require('bluebird')
const { BadRequest } = require('../../shared/httpErrors')
const { queryStoreId, queryFollowRegexes } = require('../../shared/db/store.js')
const { insertUserPlaylistFollow } = require('../../shared/db/user.js')
const spotifyApi = require('../../shared/spotify.js')

const storeName = 'Spotify'

let spotifyStoreDbId = null
const getSpotifyStoreDbId = () => {
  if (spotifyStoreDbId) {
    return BPromise.resolve(spotifyStoreDbId)
  } else {
    return queryStoreId(storeName).then(store_id => {
      spotifyStoreDbId = store_id
      return store_id
    })
  }
}

const getPlaylistDetails = async playlistId => {
  const details = await spotifyApi.getPlaylist(playlistId)
  const {
    name: title,
    owner: { display_name: author }
  } = details.body

  return { title, author }
}

const getPlaylistId = url => {
  const id = url.match(/^https:\/\/open.spotify.com\/playlist\/([0-9A-Za-z]*)/)[1]
  if (!id) {
    throw new BadRequest('Invalid Spotify URL')
  }

  return id
}

module.exports.addPlaylistFollow = async (userId, playlistUrl) => {
  // TODO: Use regex from db
  const id = getPlaylistId(playlistUrl)
  const { title, author } = await getPlaylistDetails(id)

  if (!title || !author) {
    throw new BadRequest('Fetching playlist details failed')
  }

  return await insertUserPlaylistFollow(userId, storeName, id, `${author}: ${title}`)
}

const getArtistName = module.exports.getArtistName = async url => {
  // TODO: get regex from db
  const artistId = url.match('^https://open.spotify.com/artist/([0-9A-Za-z]+)')[1]
  const {
    body: { name }
  } = await spotifyApi.getArtist(artistId)
  return name
}

const getPlaylistName = module.exports.getPlaylistName = async (type, url) => {
  const id = getPlaylistId(url)
  const { title, author } = await getPlaylistDetails(id)
  return `${author}: ${title}`
}

module.exports.getFollowDetails = async url => {
  const regexes = await queryFollowRegexes(storeName)
  const store = storeName.toLowerCase()
  let label
  for (const { regex, type } of regexes) {
    if (url.match(regex)) {
      if (type === 'artist') {
        label = await getArtistName(url)
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

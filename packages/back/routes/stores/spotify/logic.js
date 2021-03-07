const BPromise = require('bluebird')
const { BadRequest } = require('../../shared/httpErrors')
const { queryStoreId } = require('../../shared/db/store.js')
const { insertUserPlaylistFollow } = require('../../shared/db/user.js')
const { queryPreviewUrl } = require('../../shared/db/preview.js')
const spotifyApi = require('../../shared/spotify.js')

let spotifyStoreDbId = null
const getSpotifyStoreDbId = () => {
  if (spotifyStoreDbId) {
    return BPromise.resolve(spotifyStoreDbId)
  } else {
    return queryStoreId('Spotify').then(store_id => {
      spotifyStoreDbId = store_id
      return store_id
    })
  }
}

module.exports.getPreviewUrl = (id, format) =>
  getSpotifyStoreDbId().then(spotifyStoreId => queryPreviewUrl(id, format, spotifyStoreId))

module.exports.addPlaylistFollow = async (userId, playlistUrl) => {
  const spotifyPlaylistId = playlistUrl.match(/^https:\/\/open.spotify.com\/playlist\/([0-9A-Za-z]*)/)[1]
  if (!spotifyPlaylistId) {
    throw new BadRequest('Invalid Spotify URL')
  }

  const playlistDetails = await spotifyApi.getPlaylist(spotifyPlaylistId)
  const {
    name: playlistTitle,
    owner: { display_name: author }
  } = playlistDetails.body

  if (!playlistTitle || !author) {
    throw new BadRequest('\'Fetching playlist details failed\'')
  }

  return await insertUserPlaylistFollow(
    userId,
    'Spotify',
    spotifyPlaylistId,
    `${author}: ${playlistTitle}`
  )
}

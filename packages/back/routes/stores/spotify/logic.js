const { BadRequest } = require('../../shared/httpErrors')
const spotifyApi = require('../../shared/spotify.js')
const {
  spotifyTracksTransform,
  spotifyAlbumTracksTransform
} = require('multi_store_player_chrome_extension/src/js/transforms/spotify')
const R = require('ramda')
const { queryFollowRegexes } = require('../../shared/db/store')

const storeName = (module.exports.storeName = 'Spotify')
module.exports.storeUrl = 'https://www.spotify.com'

const getPlaylistDetails = async playlistId => {
  const details = await spotifyApi.getPlaylist(playlistId)
  const {
    name: title,
    owner: { display_name: author }
  } = details.body

  return { title, author }
}

const getArtistName = (module.exports.getArtistName = async url => {
  // TODO: get regex from db
  const artistId = url.match('^https://open.spotify.com/artist/([0-9A-Za-z]+)')[1]
  const {
    body: { name }
  } = await spotifyApi.getArtist(artistId)
  return name
})

const getPlaylistId = (module.exports.getPlaylistId = url => {
  const id = url.match(/^https:\/\/open.spotify.com\/playlist\/([0-9A-Za-z]*)/)[1]
  if (!id) {
    throw new BadRequest('Invalid Spotify URL')
  }

  return id
})

const getPlaylistName = (module.exports.getPlaylistName = async (type, url) => {
  const id = getPlaylistId(url)
  const { title, author } = await getPlaylistDetails(id)

  if (!title || !author) {
    throw new Error('Fetching playlist details failed')
  }

  return `${author}: ${title}`
})

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

module.exports.getPlaylistTracks = async function* ({ playlistStoreId }) {
  const res = await spotifyApi.getPlaylistTracks(playlistStoreId)
  const transformed = spotifyTracksTransform(res.body.items.filter(R.path(['track', 'preview_url'])))
  if (transformed.length === 0) {
    const error = `No tracks found for playlist at ${playlistStoreId}`
    console.error(error)
    throw new Error(error)
  }

  yield { tracks: transformed, errors: [] }
}

module.exports.getArtistTracks = async ({ artistStoreId }) => {
  const albumIds = (await spotifyApi.getArtistAlbums(artistStoreId)).body.items.map(R.prop('id'))
  // TODO: Store albums as releases
  const albums = (await spotifyApi.getAlbums(albumIds)).body.albums
  const transformed = R.flatten(spotifyAlbumTracksTransform(albums))
  if (transformed.length === 0) {
    const error = `No tracks found for artist ${artistStoreId}`
    console.error(error)
    throw new Error(error)
  }

  return { tracks: transformed, errors: [] }
}

const { BadRequest } = require('../../shared/httpErrors')
const { spotifyApi } = require('../../shared/spotify.js')
const {
  spotifyTracksTransform,
  spotifyAlbumTracksTransform
} = require('multi_store_player_chrome_extension/src/js/transforms/spotify')
const R = require('ramda')
const { queryFollowRegexes } = require('../../shared/db/store')
const logger = require('../../../logger')(__filename)

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
  const artistId = url.match('^https://(api|open).spotify.com/(v1/)?artists?/([0-9A-Za-z]+)')[3]
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

module.exports.getFollowDetails = async urlString => {
  const regexes = await queryFollowRegexes(storeName)
  const store = { name: storeName.toLowerCase() }
  let name
  for (const { regex, type } of regexes) {
    const match = urlString.match(regex)

    if (match) {
      const id = match[4]
      if (type === 'artist') {
        name = await getArtistName(urlString)
      } else if (type === 'playlist') {
        name = await getPlaylistName(type, urlString)
      } else {
        throw new Error('URL did not match any regex')
      }

      return [{ id, name, type, store, url: urlString }]
    }
  }

  return []
}

module.exports.getPlaylistTracks = async function*({ playlistStoreId }) {
  const res = await spotifyApi.getPlaylistTracks(playlistStoreId, {market: 'US'})
  const transformed = spotifyTracksTransform(res.body.items.filter(R.path(['track', 'preview_url'])))
  if (transformed.length === 0) {
    const error = `No tracks found for playlist at ${playlistStoreId}`
    logger.error(error)
    logger.debug('Spotify API response', {firstItem: res.body.items[0], items: res.body.items})
    throw new Error(error)
  }

  yield { tracks: transformed, errors: [] }
}

module.exports.getArtistTracks = async function*({ artistStoreId }) {
  const albumIds = (await spotifyApi.getArtistAlbums(artistStoreId)).body.items.map(R.prop('id'))
  // TODO: Store albums as releases
  const albums = (await spotifyApi.getAlbums(albumIds)).body.albums
  const transformed = R.flatten(spotifyAlbumTracksTransform(albums))
  if (transformed.length === 0) {
    const error = `No tracks found for artist ${artistStoreId}`
    logger.error(error)
    throw new Error(error)
  }

  yield { tracks: transformed, errors: [] }
}

module.exports.search = async query => {
  const items = (await spotifyApi.searchArtists(query)).body.artists.items
  return items.map(({ external_urls: { spotify }, id, name, type, images }) => ({
    url: spotify,
    id,
    name,
    store: { name: storeName.toLowerCase() },
    type,
    img: images[0]?.url
  }))
}

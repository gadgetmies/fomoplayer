const R = require('ramda')
const bpApi = require('./bp-api')
const { searchGenres, genreTop100Url } = require('./genres')
const { processChunks } = require('../../shared/requests')

const { beatportV4TracksTransform } = require('fomoplayer_browser_extension/src/js/transforms/beatport')
const logger = require('fomoplayer_shared').logger(__filename)

const storeName = (module.exports.storeName = 'Beatport')
module.exports.storeUrl = 'https://www.beatport.com'
module.exports.getPlaylistId = (id) => id

const storefrontUrl = (type, slug, id) => `https://www.beatport.com/${type}/${slug}/${id}`

const parseEntityUrl = (url) => {
  const match = url.match(/^https:\/\/www\.beatport\.com\/(artist|label)\/([^/]+)\/(\d+)/)
  return match ? { type: match[1], slug: match[2], id: match[3] } : null
}

const getPlaylistName = (module.exports.getPlaylistName = async ({ url }) => {
  const playlist = await bpApi.getPlaylist(url)
  return playlist.name
})

const getDetails = (module.exports.getArtistDetails = async (url) => {
  const parsed = parseEntityUrl(url)
  if (!parsed) {
    throw new Error(`Unable to extract Beatport details from url: ${url}`)
  }
  const { type, id, slug } = parsed
  const entity = type === 'artist' ? await bpApi.getArtist(id) : await bpApi.getLabel(id)
  return { url, name: entity.name, img: entity.image?.uri, type, id, slug: entity.slug ?? slug }
})

module.exports.getLabelName = module.exports.getArtistName = async (url) => (await getDetails(url)).name

module.exports.getFollowDetails = async ({ id, url, type }) => {
  let details

  if (type === 'artist' || type === 'label') {
    details = await getDetails(url)
  } else if (type === 'playlist') {
    details = { id: url, name: await getPlaylistName({ url }) }
  } else {
    throw new Error('Regex type not handled in code!')
  }

  return [{ id, ...details, type, store: { name: storeName }, url }]
}

module.exports.getArtistTracks = async function* ({ artistStoreId }) {
  const tracks = beatportV4TracksTransform(await bpApi.getArtistTracks(artistStoreId))
  if (tracks.length === 0) {
    logger.warn(`No tracks found for artist ${artistStoreId}`)
  }
  yield { tracks, errors: [] }
}

module.exports.getLabelTracks = async function* ({ labelStoreId }) {
  const tracks = beatportV4TracksTransform(await bpApi.getLabelTracks(labelStoreId))
  if (tracks.length === 0) {
    logger.warn(`No tracks found for label ${labelStoreId}`, { labelStoreId })
  }
  yield { tracks, errors: [] }
}

module.exports.getPlaylistTracks = async function* ({ playlistStoreId: url }) {
  const tracks = beatportV4TracksTransform(await bpApi.getPlaylistTracks(url))
  if (tracks.length === 0) {
    logger.warn(`No tracks found for playlist at ${url}`)
  }
  yield { tracks, errors: [] }
}

// Matching genres are surfaced as their top-100 chart, which is the playlist a
// user follows to track a whole genre. The genre set is cached locally, so this
// adds no API call.
const genrePlaylistResults = (query) =>
  searchGenres(query).map((genre) => {
    const url = genreTop100Url(genre)
    return {
      type: 'playlist',
      id: url,
      name: `${genre.name} Top 100`,
      url,
      store: { name: storeName.toLowerCase() },
    }
  })

// Beatport playlists are followed by their storefront URL, which the v4 client
// resolves back to the catalog playlist route. Surface them as the 'playlist'
// follow type, same as genre top-100s.
const playlistResults = (items) =>
  items.map((item) => {
    const url = storefrontUrl('playlist', item.slug ?? 'playlist', item.id)
    return {
      type: 'playlist',
      id: url,
      name: item.name,
      img: item.image?.uri,
      url,
      store: { name: storeName.toLowerCase() },
    }
  })

const mapEntities = (items, type) =>
  items.map((item) => ({
    type,
    id: item.id,
    name: item.name,
    img: item.image?.uri,
    url: storefrontUrl(type, item.slug, item.id),
    store: { name: storeName.toLowerCase() },
  }))

const searchEntities = async (query, type) => {
  const { artists = [], labels = [] } = await bpApi.search(query)
  return mapEntities(type === 'label' ? labels : artists, type)
}

const searchPlaylists = async (query) => [
  ...playlistResults(await bpApi.searchPlaylists(query)),
  ...genrePlaylistResults(query),
]

// `type` (artist | label | playlist) lets the caller fetch a single category so
// results can be shown as each request completes; omitting it returns everything.
module.exports.search = async (query, type) => {
  if (type === 'artist' || type === 'label') return searchEntities(query, type)
  if (type === 'playlist') return searchPlaylists(query)
  const [{ artists = [], labels = [] }, playlists] = await Promise.all([
    bpApi.search(query),
    searchPlaylists(query),
  ])
  return [...mapEntities(artists, 'artist'), ...mapEntities(labels, 'label'), ...playlists]
}

module.exports.getTracksForISRCs = async (isrcs) => {
  const tracks = (
    await processChunks(
      isrcs,
      1,
      async ([trackISRC]) => beatportV4TracksTransform(await bpApi.getTracksByIsrc(trackISRC)),
      { concurrency: 1 },
    )
  ).flat()
  return R.uniq(tracks.filter(({ isrc }) => isrcs.includes(isrc)))
}

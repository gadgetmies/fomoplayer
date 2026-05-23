/**
 * Thin client for the Beatport v4 catalog API (api.beatport.com/v4).
 *
 * Replaces the previous www.beatport.com page scraping, which Beatport put
 * behind a Cloudflare managed challenge. Every request carries a Bearer token
 * from the app-level token manager and retries once after a forced re-auth on
 * 401.
 */
const { getAccessToken, _reset } = require('./beatport-token')
const { genreById } = require('./genres')

const API_BASE = 'https://api.beatport.com/v4'
const PER_PAGE = 100

const apiGet = async (path, { retried = false } = {}) => {
  const token = await getAccessToken()
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (response.status === 401 && !retried) {
    _reset()
    return apiGet(path, { retried: true })
  }
  if (!response.ok) {
    throw new Error(
      `Beatport API request failed (${response.status}) for ${path}: ${(await response.text()).slice(0, 200)}`,
    )
  }
  return response.json()
}

// Playlists are followed by storefront URL (the playlist regex is a catch-all).
// Resolve the kind + numeric id so the right v4 catalog route can be built:
//   /genre/{slug}/{id}/top-100  -> genre top 100 (/catalog/genres/{id}/top/100/)
//   /top-100                    -> overall top 100 (/catalog/top/100/)
//   /chart(s)/{slug}/{id}       -> chart        (/catalog/charts/{id}/...)
//   /playlist(s)/{slug}/{id}    -> user playlist (/catalog/playlists/{id}/...)
// The /top-100 suffix on genre URLs is optional so legacy bare /genre/{slug}/{id}
// follows keep working until the migration appends it.
const parsePlaylistUrl = (url) => {
  let match
  if ((match = url.match(/beatport\.com\/genre\/[^/]+\/(\d+)(?:\/top-100)?\/?(?:[?#]|$)/))) {
    return { kind: 'genre-top', id: match[1] }
  }
  if (/beatport\.com\/top-100\/?(?:[?#]|$)/.test(url)) {
    return { kind: 'top' }
  }
  if ((match = url.match(/beatport\.com\/(chart|playlist)s?\/[^/]+\/(\d+)/))) {
    return { kind: match[1], id: match[2] }
  }
  return null
}

const requireParsedPlaylist = (url) => {
  const parsed = parsePlaylistUrl(url)
  if (!parsed) throw new Error(`Unsupported Beatport playlist URL for the v4 API: ${url}`)
  return parsed
}

// Genre top-100 and the overall top-100 have no detail endpoint that carries a
// name, so synthesise one from the cached genre catalog.
const synthesizedPlaylistName = (parsed) => {
  if (parsed.kind === 'top') return 'Beatport Top 100'
  if (parsed.kind === 'genre-top') {
    const genre = genreById(parsed.id)
    return genre ? `${genre.name} Top 100` : `Beatport Genre ${parsed.id} Top 100`
  }
  return null
}

const detailBase = (parsed) =>
  parsed.kind === 'chart' ? `/catalog/charts/${parsed.id}/` : `/catalog/playlists/${parsed.id}/`

module.exports = {
  parsePlaylistUrl,

  search: (query) => apiGet(`/catalog/search/?q=${encodeURIComponent(query)}`),

  getArtist: (artistId) => apiGet(`/catalog/artists/${artistId}/`),
  getLabel: (labelId) => apiGet(`/catalog/labels/${labelId}/`),

  getPlaylist: (url) => {
    const parsed = requireParsedPlaylist(url)
    const name = synthesizedPlaylistName(parsed)
    return name === null ? apiGet(detailBase(parsed)) : Promise.resolve({ name })
  },

  getArtistTracks: async (artistId, page = 1) =>
    (await apiGet(`/catalog/artists/${artistId}/tracks/?page=${page}&per_page=${PER_PAGE}&order_by=-publish_date`))
      .results,

  // Labels have no nested tracks route; filter the tracks collection by label.
  getLabelTracks: async (labelId, page = 1) =>
    (await apiGet(`/catalog/tracks/?label_id=${labelId}&page=${page}&per_page=${PER_PAGE}&order_by=-publish_date`))
      .results,

  getPlaylistTracks: async (url, page = 1) => {
    const parsed = requireParsedPlaylist(url)
    if (parsed.kind === 'genre-top') return (await apiGet(`/catalog/genres/${parsed.id}/top/100/`)).results
    if (parsed.kind === 'top') return (await apiGet(`/catalog/top/100/`)).results
    return (await apiGet(`${detailBase(parsed)}tracks/?page=${page}&per_page=${PER_PAGE}`)).results
  },

  // Full genre catalog, following pagination. Used by the genre-drift job.
  getGenres: async () => {
    const results = []
    let next = `/catalog/genres/?per_page=200`
    while (next) {
      const data = await apiGet(next)
      results.push(...(data.results ?? []))
      next = data.next ? data.next.replace(API_BASE, '') : null
    }
    return results
  },

  getTracksByIsrc: async (isrc) => (await apiGet(`/catalog/tracks/?isrc=${encodeURIComponent(isrc)}`)).results,
}

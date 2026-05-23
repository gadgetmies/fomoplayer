/**
 * Thin client for the Beatport v4 catalog API (api.beatport.com/v4).
 *
 * Replaces the previous www.beatport.com page scraping, which Beatport put
 * behind a Cloudflare managed challenge. Every request carries a Bearer token
 * from the app-level token manager and retries once after a forced re-auth on
 * 401.
 */
const { getAccessToken, _reset } = require('./beatport-token')

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

// Playlists are followed by URL (the playlist regex is a catch-all). Resolve a
// numeric id + kind from chart/playlist URLs; unsupported shapes throw.
const playlistBaseFromUrl = (url) => {
  const match = url.match(/beatport\.com\/(chart|playlist)s?\/[^/]+\/(\d+)/)
  if (!match) return null
  const [, kind, id] = match
  return kind === 'chart' ? `/catalog/charts/${id}/` : `/catalog/playlists/${id}/`
}

const requirePlaylistBase = (url) => {
  const base = playlistBaseFromUrl(url)
  if (!base) throw new Error(`Unsupported Beatport playlist URL for the v4 API: ${url}`)
  return base
}

module.exports = {
  search: (query) => apiGet(`/catalog/search/?q=${encodeURIComponent(query)}`),

  getArtist: (artistId) => apiGet(`/catalog/artists/${artistId}/`),
  getLabel: (labelId) => apiGet(`/catalog/labels/${labelId}/`),
  getPlaylist: (url) => apiGet(requirePlaylistBase(url)),

  getArtistTracks: async (artistId, page = 1) =>
    (await apiGet(`/catalog/artists/${artistId}/tracks/?page=${page}&per_page=${PER_PAGE}`)).results,

  getLabelTracks: async (labelId, page = 1) =>
    (await apiGet(`/catalog/labels/${labelId}/tracks/?page=${page}&per_page=${PER_PAGE}`)).results,

  getPlaylistTracks: async (url, page = 1) =>
    (await apiGet(`${requirePlaylistBase(url)}tracks/?page=${page}&per_page=${PER_PAGE}`)).results,

  getTracksByIsrc: async (isrc) => (await apiGet(`/catalog/tracks/?isrc=${encodeURIComponent(isrc)}`)).results,
}

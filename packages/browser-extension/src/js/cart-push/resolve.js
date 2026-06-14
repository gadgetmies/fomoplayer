'use strict'

// Resolve a Fomo Player cart into per-store push queues.
//
// Each track row from `GET /api/me/carts/<id>` exposes a `stores` array
// (built by the `track_details` SQL function). For each row we pick the
// store-specific identifier:
//   - Beatport: `entry.trackId` (the `store__track_store_id`, parseable as
//     integer — Beatport's API `item_id`).
//   - Bandcamp: `entry.url` (the `store__track_url`, the track page URL).
//
// Tracks lacking the identifier go into `notOnStore`; the rest become the
// `queue`.

const formatArtist = (artists) => {
  if (!Array.isArray(artists) || artists.length === 0) return ''
  return artists.map((a) => a && a.name).filter(Boolean).join(', ')
}

const findStoreEntry = (stores, storeCode) => {
  if (!Array.isArray(stores)) return null
  return (
    stores.find((s) => s && (s.code === storeCode || (s.name && s.name.toLowerCase() === storeCode))) || null
  )
}

const beatportItemId = (entry) => {
  if (!entry) return null
  const raw = entry.trackId
  if (raw === null || raw === undefined || raw === '') return null
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

const bandcampUrl = (entry) => {
  if (!entry) return null
  const url = entry.url
  if (typeof url !== 'string' || url.length === 0) return null
  return url
}

const fomoplayerTrackUrl = (appUrl, trackId) =>
  `${appUrl.replace(/\/+$/, '')}/tracks?q=${encodeURIComponent(`track:${trackId}`)}`

const resolveCartTracks = async ({ store, fomoplayerCartId }, deps) => {
  const { apiFetch, getAppUrl } = deps
  const cart = await apiFetch(`/api/me/carts/${fomoplayerCartId}`)
  const appUrl = getAppUrl ? await getAppUrl() : ''
  const tracks = (cart && cart.tracks) || []
  const cartName = (cart && cart.name) || ''
  const queue = []
  const notOnStore = []
  for (const track of tracks) {
    const entry = findStoreEntry(track && track.stores, store)
    const artist = formatArtist(track && track.artists)
    const title = (track && track.title) || ''
    const fpUrl = appUrl ? fomoplayerTrackUrl(appUrl, track.id) : ''
    const meta = { trackId: track.id, artist, title, fomoplayerUrl: fpUrl }
    if (store === 'beatport') {
      const itemId = beatportItemId(entry)
      if (itemId === null) {
        notOnStore.push(meta)
      } else {
        queue.push({ ...meta, itemId })
      }
    } else if (store === 'bandcamp') {
      const url = bandcampUrl(entry)
      if (url === null) {
        notOnStore.push(meta)
      } else {
        queue.push({ ...meta, url })
      }
    } else {
      throw new Error(`Unknown store: ${store}`)
    }
  }
  return { queue, notOnStore, cartName }
}

module.exports = { resolveCartTracks }

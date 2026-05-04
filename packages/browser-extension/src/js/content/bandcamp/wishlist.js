// Bandcamp wishlist → Fomo Player cart sync.
//
// Bandcamp wishlist pages render a JSON `data-blob` on `<div id="pagedata">`
// that contains the user's wishlist items, including the embedded TralbumData
// for items the page has already loaded. We pull releases that have inline
// `tracks[]` with playable URLs, build the same release shape that
// `bandcampReleasesTransform` expects, and ship them to the worker for cart
// reconciliation.

const onWishlistPage = () => /^\/[^/]+\/wishlist/.test(location.pathname)

const readPageDataBlob = () => {
  const node = document.getElementById('pagedata')
  if (!node) return null
  const raw = node.getAttribute('data-blob')
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (_) {
    return null
  }
}

const blobItemToRelease = (item) => {
  if (!item || !Array.isArray(item.tracklist) || item.tracklist.length === 0) return null
  const trackinfo = item.tracklist
    .filter((t) => t && t.file && (t.file['mp3-128'] || Object.keys(t.file).length > 0))
    .map((t) => ({
      id: t.id || t.track_id || t.item_id,
      title: t.title,
      artist: t.artist || item.band_name,
      duration: t.duration || (t.duration_ms ? t.duration_ms / 1000 : 0),
      file: t.file,
    }))
  if (trackinfo.length === 0) return null
  return {
    id: item.tralbum_id || item.album_id || item.item_id,
    url: item.tralbum_url || item.item_url,
    artist: item.band_name,
    art_id: item.item_art_id,
    album_release_date: item.release_date || item.added,
    current: {
      title: item.tralbum_title || item.title,
      release_date: item.release_date,
      publish_date: item.added || item.release_date,
      band_id: item.band_id,
    },
    trackinfo,
  }
}

export const collectWishlistReleases = () => {
  const blob = readPageDataBlob()
  if (!blob) return []
  const items =
    blob.wishlist_data?.items ||
    blob.wishlist?.items ||
    blob.collection_data?.items ||
    []
  return items.map(blobItemToRelease).filter(Boolean)
}

export const isOnWishlist = onWishlistPage

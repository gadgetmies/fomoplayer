import browser from '../../browser'
// Helpers for extracting bandcamp release / track data from the page.
//
// Modern bandcamp pages serialize the full release payload (trackinfo,
// art_id, current, etc.) into a `data-tralbum` attribute on the
// `tralbum_head` script tag. Older pages relied on `window.TralbumData` in
// the page's main world; we fall back to a bridge script for those.

const BRIDGE_EVENT = 'fomoplayer:bandcamp:bridge-result'
const BRIDGE_REQUEST = 'fomoplayer:bandcamp:bridge-request'

const readTralbumFromDom = () => {
  // Pages that aren't release pages (/music, fan pages, etc.) still carry a
  // `data-tralbum` attribute, but it's a stub like `{"url": "..."}` without
  // `trackinfo`. Those should resolve to null so callers don't try to act
  // on them.
  const script = document.querySelector('script[data-tralbum]')
  if (!script) return null
  const raw = script.getAttribute('data-tralbum')
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.trackinfo) || parsed.trackinfo.length === 0) return null
    return enrichWithBandData(script, parsed)
  } catch (_) {
    return null
  }
}

const enrichWithBandData = (script, tralbum) => {
  // The legacy `window.TralbumData` exposed `artist` and `current.band_id`;
  // when reading from the data-attribute we sometimes need to back-fill
  // these from the sibling `data-band` payload on the same script tag.
  if (tralbum.artist && tralbum.current?.band_id) return tralbum
  try {
    const bandRaw = script.getAttribute('data-band')
    if (!bandRaw) return tralbum
    const band = JSON.parse(bandRaw)
    return {
      ...tralbum,
      artist: tralbum.artist || band.name,
      current: {
        ...tralbum.current,
        band_id: tralbum.current?.band_id || band.id,
      },
    }
  } catch (_) {
    return tralbum
  }
}

let bridgeInstalled = false

const installBridge = () => {
  if (bridgeInstalled) return
  bridgeInstalled = true
  const code = `
    (function () {
      window.addEventListener('${BRIDGE_REQUEST}', function (e) {
        var detail = e.detail || {}
        var payload = null
        try {
          if (detail.kind === 'tralbum') {
            payload = window.TralbumData ? JSON.parse(JSON.stringify(window.TralbumData)) : null
          }
        } catch (err) {
          payload = { error: String(err) }
        }
        window.dispatchEvent(new CustomEvent('${BRIDGE_EVENT}', {
          detail: { id: detail.id, payload: payload }
        }))
      })
    })();
  `
  const script = document.createElement('script')
  script.textContent = code
  ;(document.head || document.documentElement).appendChild(script)
  script.remove()
}

let bridgeId = 0
const askBridge = (kind) =>
  new Promise((resolve) => {
    installBridge()
    const id = ++bridgeId
    const handler = (event) => {
      if (event?.detail?.id !== id) return
      window.removeEventListener(BRIDGE_EVENT, handler)
      resolve(event.detail.payload)
    }
    window.addEventListener(BRIDGE_EVENT, handler)
    window.dispatchEvent(new CustomEvent(BRIDGE_REQUEST, { detail: { id, kind } }))
    setTimeout(() => {
      window.removeEventListener(BRIDGE_EVENT, handler)
      resolve(null)
    }, 1500)
  })

export const readTralbumData = async () => {
  const fromDom = readTralbumFromDom()
  if (fromDom) return fromDom
  return askBridge('tralbum')
}

// Discography / label pages link out to per-release URLs that can live on
// a different bandcamp subdomain than the current page. Fetching them
// directly from the content script trips page-origin CORS, so we delegate
// to the worker (which has *.bandcamp.com host permission) and parse the
// returned HTML locally where DOMParser is available.
const releaseFetchCache = new Map()

// The worker's response wrapper preserves `{ ok, ... }` shapes verbatim and
// wraps bare values as `{ ok: true, data: ... }`. Tolerate both shapes so
// future wrapper changes can't silently break this path.
const sendToWorker = (message) => browser.runtime.sendMessage(message).catch(() => null)

export const fetchReleaseTralbum = async (relativeUrl) => {
  if (!relativeUrl) return null
  const absolute = new URL(relativeUrl, location.origin).toString()
  if (releaseFetchCache.has(absolute)) return releaseFetchCache.get(absolute)
  const promise = (async () => {
    try {
      const response = await sendToWorker({ type: 'bandcamp:fetch-html', url: absolute })
      const html = response?.html || response?.data?.html
      if (!html) return null
      const doc = new DOMParser().parseFromString(html, 'text/html')
      const script = doc.querySelector('script[data-tralbum]')
      if (!script) return null
      const raw = script.getAttribute('data-tralbum')
      const parsed = raw ? JSON.parse(raw) : null
      if (!parsed || !Array.isArray(parsed.trackinfo) || parsed.trackinfo.length === 0) return null
      return enrichWithBandData(script, parsed)
    } catch (_) {
      return null
    }
  })()
  releaseFetchCache.set(absolute, promise)
  return promise
}

// Single track filter — given a TralbumData and a track id from the page,
// return a release-shaped object containing only that one trackinfo. Lets
// us re-use bandcampReleasesTransform for a per-track add-to-cart click.
export const releaseWithSingleTrack = (release, trackId) => {
  if (!release || !Array.isArray(release.trackinfo)) return null
  const filtered = release.trackinfo.filter((t) => String(t.id) === String(trackId))
  if (filtered.length === 0) return null
  return { ...release, trackinfo: filtered }
}

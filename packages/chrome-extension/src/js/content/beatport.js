// Beatport content script. Runs on https://*.beatport.com/* pages and serves
// scrape requests sent by the popup (and forwarded by the worker). Replaces
// the MV2 `chrome.tabs.executeScript` pattern in src/js/popup/BeatportPanel.jsx.
import browser from '../browser'

const PER_PAGE = 150
const MY_BEATPORT_PATH = (page) => `/my-beatport?page=${page}&per-page=${PER_PAGE}`

const reportError = (message, error) =>
  browser.runtime
    .sendMessage({ type: 'error', message, stack: error?.stack || String(error) })
    .catch(() => {})

const reportProgress = (text, progress) =>
  browser.runtime.sendMessage({ type: 'operationStatus', text, progress }).catch(() => {})

const fetchPlayablesForUrl = async (path) => {
  const response = await fetch(path, { credentials: 'include' })
  if (!response.ok) throw new Error(`Beatport request to ${path} failed: ${response.status}`)
  const html = await response.text()
  const match = html.match(/window\.Playables\s*=\s*(\{[\s\S]*?\});/)
  if (!match) throw new Error(`Beatport response at ${path} did not contain window.Playables`)
  return JSON.parse(match[1])
}

const scrapeMyBeatport = async ({ pageCount, type }) => {
  for (let page = 1; page <= pageCount; page += 1) {
    await reportProgress('Fetching tracks', Math.round((page / pageCount) * 100))
    const playables = await fetchPlayablesForUrl(MY_BEATPORT_PATH(page))
    await browser.runtime.sendMessage({
      type: 'tracks',
      store: 'beatport',
      done: page === pageCount,
      data: { type, tracks: playables.tracks },
    })
  }
}

const scrapeCurrentPage = async ({ type }) => {
  await reportProgress('Fetching tracks', 50)
  const playables = await fetchPlayablesForUrl(window.location.pathname + window.location.search)
  await browser.runtime.sendMessage({
    type: 'tracks',
    store: 'beatport',
    done: true,
    data: { type, tracks: playables.tracks },
  })
}

const scrapeArtistsAndLabels = async () => {
  await reportProgress('Fetching artists and labels', 20)
  const response = await fetch('https://www.beatport.com/api/my-beatport', { credentials: 'include' })
  if (!response.ok) throw new Error(`my-beatport API failed: ${response.status}`)
  const { artists = [], labels = [] } = await response.json()
  const project = ({ id, url, name }) => ({ id, url, name })
  await browser.runtime.sendMessage({
    type: 'artists',
    store: 'beatport',
    done: true,
    data: artists.map(project),
  })
  await browser.runtime.sendMessage({
    type: 'labels',
    store: 'beatport',
    done: true,
    data: labels.map(project),
  })
}

// Beatport retired the `/api/v4/my/downloads` REST endpoint on www; the
// browser-side equivalent is the Next.js `getServerSideProps` data file for
// the /library page, which embeds the React-Query dehydrated cache. It uses
// the session cookie like any other www.beatport.com request, so no bearer
// is needed.
const LIBRARY_PER_PAGE = 100

const getNextDataMeta = () => {
  const el = document.getElementById('__NEXT_DATA__')
  if (!el || !el.textContent) throw new Error('Beatport __NEXT_DATA__ script not found on page')
  const data = JSON.parse(el.textContent)
  if (!data?.buildId) throw new Error('Beatport __NEXT_DATA__ missing buildId')
  return { buildId: data.buildId, locale: data.locale || 'en' }
}

const fetchLibraryPage = async ({ buildId, locale }, page) => {
  const url = `/_next/data/${encodeURIComponent(buildId)}/${locale}/library.json?page=${page}&per_page=${LIBRARY_PER_PAGE}`
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' })
  if (!response.ok) throw new Error(`library.json page ${page} failed: ${response.status}`)
  const body = await response.json()
  const queries = body?.pageProps?.dehydratedState?.queries
  const query = Array.isArray(queries) ? queries.find((q) => Array.isArray(q?.state?.data?.results)) : null
  if (!query) throw new Error(`library.json page ${page} missing dehydrated download results`)
  return query.state.data
}

const scrapeMyLibrary = async () => {
  await reportProgress('Fetching library', 1)
  const meta = getNextDataMeta()
  const collected = []
  for (let page = 1; ; page += 1) {
    const data = await fetchLibraryPage(meta, page)
    const results = Array.isArray(data.results) ? data.results : []
    collected.push(...results)
    const total = typeof data.count === 'number' && data.count > 0 ? data.count : collected.length
    await reportProgress('Fetching library', Math.min(99, Math.round((collected.length / total) * 100)))
    if (results.length === 0 || !data.next) break
  }
  await browser.runtime.sendMessage({
    type: 'purchased',
    store: 'beatport',
    data: {
      pageProps: {
        dehydratedState: {
          queries: [{ state: { data: { results: collected } } }],
        },
      },
    },
  })
}

// Beatport's auth-required pages (e.g. /my-beatport) 307-redirect to
// /?next=<path> when the session cookie is missing, and serve the page directly
// when it is valid. A HEAD with redirect:'manual' lets us read that signal
// without downloading a body: opaqueredirect => logged out, 200 => logged in.
const fetchLoggedIn = async () => {
  try {
    const response = await fetch('/my-beatport', {
      method: 'HEAD',
      credentials: 'include',
      redirect: 'manual',
      cache: 'no-store',
    })
    return response.type === 'basic' && response.ok
  } catch {
    return false
  }
}

// Cache the answer in extension storage so the popup can render the buttons in
// their final state on first paint instead of waiting for a HEAD round-trip.
const LOGIN_CACHE_KEY = 'beatportLoginCache'
const LOGIN_CACHE_TTL_MS = 60_000

const readLoginCache = async () => {
  try {
    const stored = await browser.storage.local.get(LOGIN_CACHE_KEY)
    const entry = stored?.[LOGIN_CACHE_KEY]
    if (!entry || typeof entry.ts !== 'number') return null
    if (Date.now() - entry.ts > LOGIN_CACHE_TTL_MS) return null
    return Boolean(entry.loggedIn)
  } catch {
    return null
  }
}

const refreshLoginCache = async () => {
  const loggedIn = await fetchLoggedIn()
  try {
    await browser.storage.local.set({ [LOGIN_CACHE_KEY]: { loggedIn, ts: Date.now() } })
  } catch {}
  return loggedIn
}

const probeLoggedIn = async () => {
  const cached = await readLoginCache()
  if (cached !== null) return cached
  return refreshLoginCache()
}

const probeHasPlayables = () => Boolean(document.querySelector('.playable-play'))

// Warm the cache as soon as the content script runs so the popup finds a fresh
// answer waiting when the user clicks the toolbar icon.
refreshLoginCache().catch(() => {})

browser.runtime.onMessage.addListener(async (message) => {
  try {
    switch (message?.type) {
      case 'beatport:probe':
        return { loggedIn: await probeLoggedIn(), hasPlayables: probeHasPlayables() }
      case 'beatport:scrape-current-page':
        await scrapeCurrentPage({ type: message.trackType || 'tracks' })
        return { ok: true }
      case 'beatport:scrape-my-beatport':
        await scrapeMyBeatport({ pageCount: message.pageCount || 20, type: message.trackType || 'tracks' })
        return { ok: true }
      case 'beatport:scrape-artists-and-labels':
        await scrapeArtistsAndLabels()
        return { ok: true }
      case 'beatport:scrape-my-library':
        await scrapeMyLibrary()
        return { ok: true }
      default:
        return undefined
    }
  } catch (e) {
    await reportError(`Beatport content script failed: ${message?.type}`, e)
    return { ok: false, error: e?.message }
  }
})

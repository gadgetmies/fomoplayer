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

const scrapeMyLibrary = async () => {
  await reportProgress('Fetching library', 20)
  const response = await fetch('https://www.beatport.com/api/v4/my/downloads?page=1&per_page=500', {
    credentials: 'include',
  })
  if (!response.ok) throw new Error(`v4/my/downloads failed: ${response.status}`)
  const body = await response.json()
  await browser.runtime.sendMessage({
    type: 'purchased',
    store: 'beatport',
    data: body.results,
  })
}

const probeLoggedIn = () => Boolean(document.querySelector('.head-account-link[data-href="/account/profile"]'))
const probeHasPlayables = () => Boolean(document.querySelector('.playable-play'))

browser.runtime.onMessage.addListener(async (message) => {
  try {
    switch (message?.type) {
      case 'beatport:probe':
        return { loggedIn: probeLoggedIn(), hasPlayables: probeHasPlayables() }
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

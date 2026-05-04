// Bandcamp content script. Runs on https://*.bandcamp.com/* and is
// responsible for:
//  - serving scrape requests from the popup/worker (legacy path used by
//    sync features in src/js/popup/BandcampPanel.jsx),
//  - bootstrapping the embedded Fomo Player player UI and per-track buttons,
//  - triggering wishlist sync when the user is viewing their wishlist.
import browser from '../browser'
import { installPlayerUi, setVisible } from './bandcamp/player-ui'
import { installInjections, removeInjections } from './bandcamp/inject'
import { collectWishlistReleases, isOnWishlist } from './bandcamp/wishlist'

const reportError = (message, error) =>
  browser.runtime
    .sendMessage({ type: 'error', message, stack: error?.stack || String(error) })
    .catch(() => {})

const reportProgress = (text, progress) =>
  browser.runtime.sendMessage({ type: 'operationStatus', text, progress }).catch(() => {})

const sendToWorker = (message) => browser.runtime.sendMessage(message).catch(() => null)

const scrapeFeed = async ({ pageCount }) => {
  let olderThan = Date.now()
  const collectionResponse = await fetch('https://bandcamp.com/api/fan/2/collection_summary', {
    credentials: 'include',
  })
  if (!collectionResponse.ok) {
    throw new Error(`collection_summary failed: ${collectionResponse.status}`)
  }
  const fanId = (await collectionResponse.json()).fan_id

  for (let page = 1; page <= pageCount; page += 1) {
    const feedResponse = await fetch('https://bandcamp.com/fan_dash_feed_updates', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `fan_id=${fanId}&older_than=${olderThan}`,
    })
    if (!feedResponse.ok) {
      throw new Error(`fan_dash_feed_updates failed: ${feedResponse.status}`)
    }
    const feed = await feedResponse.json()
    await reportProgress('Fetching releases', Math.round((page / pageCount) * 100))
    const newReleases = feed.stories.entries.filter(({ story_type: storyType }) => storyType === 'nr')
    await browser.runtime.sendMessage({
      type: 'releases',
      store: 'bandcamp',
      done: page === pageCount,
      data: newReleases,
    })
    olderThan = feed.stories.oldest_story_date
  }
}

const probeLoggedIn = () => Boolean(document.querySelector('.userpic'))
const probeHasPlayables = () => Boolean(document.querySelector('.track_list.track_table'))
const probeOnSubdomain = () => {
  try {
    return new URL(window.location.href).hostname !== 'bandcamp.com'
  } catch {
    return false
  }
}

const syncWishlistFromPage = async () => {
  if (!isOnWishlist()) {
    return { ok: false, error: 'Open your bandcamp wishlist page to sync.' }
  }
  const releases = collectWishlistReleases()
  if (releases.length === 0) {
    return { ok: false, error: 'No wishlist items with playable tracks found on this page.' }
  }
  return sendToWorker({ type: 'bandcamp:wishlist-sync', releases })
}

browser.runtime.onMessage.addListener(async (message) => {
  try {
    switch (message?.type) {
      case 'bandcamp:probe':
        return {
          loggedIn: probeLoggedIn(),
          hasPlayables: probeHasPlayables(),
          onSubdomain: probeOnSubdomain(),
        }
      case 'bandcamp:scrape-current-page':
        return { ok: false, error: 'Use scripting.executeScript from worker for current-page scrape' }
      case 'bandcamp:scrape-feed':
        await scrapeFeed({ pageCount: message.pageCount || 5 })
        return { ok: true }
      case 'bandcamp:trigger-wishlist-sync':
        return syncWishlistFromPage()
      default:
        return undefined
    }
  } catch (e) {
    await reportError(`Bandcamp content script failed: ${message?.type}`, e)
    return { ok: false, error: e?.message }
  }
})

const refreshAuthVisibility = async () => {
  const response = await sendToWorker({ type: 'bandcamp:auth-status' })
  // Tolerate both `{ ok: true, loggedIn }` and the wrapper shape
  // `{ ok: true, data: { loggedIn } }` so a future change to the worker's
  // response wrapper can't silently disable the player UI again.
  const loggedIn = Boolean(response?.loggedIn ?? response?.data?.loggedIn)
  setVisible(loggedIn)
  if (loggedIn) {
    installInjections()
    installPlayerUi()
  } else {
    removeInjections()
  }
}

;(async () => {
  await refreshAuthVisibility()
  // Re-check when the worker reports a login or when storage tokens change.
  browser.runtime.onMessage.addListener((message) => {
    if (message?.type === 'login' || message?.type === 'logout' || message?.type === 'refresh') {
      refreshAuthVisibility()
    }
  })
  if (browser.storage?.onChanged) {
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return
      if (changes.refreshToken || changes.appUrl) refreshAuthVisibility()
    })
  }
})()

// Bandcamp content script. Runs on https://*.bandcamp.com/* and is
// responsible for:
//  - serving scrape requests from the popup/worker (legacy path used by
//    sync features in src/js/popup/BandcampPanel.jsx),
//  - bootstrapping the embedded Fomo Player player UI and per-track buttons,
//  - triggering wishlist sync when the user is viewing their wishlist.
import '../sentry'
import browser from '../browser'
import { installPlayerUi, setVisible } from './bandcamp/player-ui'
import { installInjections, removeInjections } from './bandcamp/inject'
import { install as installHideNativePlay } from './bandcamp/hide-native-play'
import { collectWishlistReleases, isOnWishlist } from './bandcamp/wishlist'

const reportError = (message, error) =>
  browser.runtime
    .sendMessage({ type: 'error', message, stack: error?.stack || String(error) })
    .catch(() => {})

const sendToWorker = (message) => browser.runtime.sendMessage(message).catch(() => null)

// Bandcamp's hydrated menubar exposes a "Log in" link
// (`a[href*="/login?from=menubar"]`) only when no fan is signed in. The
// link's absence is the most reliable cross-page signal: it works on
// every bandcamp.com surface where the menubar is rendered (homepage,
// release page, artist subdomain, fan dashboard, discover, feed). We
// don't rely on the server-rendered `#pagedata` blob — its `identities`
// object is empty on cached / homepage responses even for signed-in
// fans — and the `.userpic` element only ships on a small subset of
// pages.
const probeLoggedIn = () => !document.querySelector('a[href*="/login?from=menubar"]')
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
        return sendToWorker({ type: 'bandcamp:scrape-feed', pageCount: message.pageCount || 5 })
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
  installHideNativePlay().catch((e) => reportError('Bandcamp hide-native-play install failed', e))
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

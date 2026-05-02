import * as R from 'ramda'
import browser from './browser'
import { bandcampReleasesTransform } from './transforms/bandcamp'
import { beatportTracksTransform, beatportLibraryTransform } from './transforms/beatport'
import {
  clearTokens,
  completeLoginFromCallback,
  persistTokens,
  purgeLegacyTokens,
  resolveAccessToken,
  sendLogout,
  startExtensionLogin,
} from './auth'

if (typeof DEFAULT_APP_URL !== 'string' || DEFAULT_APP_URL.length === 0) {
  throw new Error('DEFAULT_APP_URL is not configured at build time. Check webpack DefinePlugin / utils/config.js.')
}

const BEATPORT_STORE_URL = 'https://www.beatport.com'
const BANDCAMP_STORE_URL = 'https://bandcamp.com'

const getAppUrl = async () => {
  const { appUrl } = await browser.storage.local.get(['appUrl'])
  return appUrl || DEFAULT_APP_URL
}

const broadcast = (message) => browser.runtime.sendMessage(message).catch(() => {})

const setStatus = async (operationStatus, operationProgress) => {
  await browser.storage.local.set({ operationStatus, operationProgress })
  broadcast({ type: 'refresh' })
}

const clearStatus = async () => {
  await browser.storage.local.set({ operationStatus: '', operationProgress: 0 })
  broadcast({ type: 'done' })
}

const handleError = async (error) => {
  await clearStatus()
  await browser.storage.local.set({ error })
  broadcast({ type: 'error', ...error })
}

const reportFailure = (storeUrl, path, e) =>
  handleError({
    message: `Failed to send ${path} from ${storeUrl}`,
    stack: JSON.stringify({ url: path, storeUrl, stack: e.stack, time: new Date().toUTCString() }),
  })

const postToFomoplayer = async ({ path, body, storeUrl, statusLabel, chunkSize }) => {
  const appUrl = await getAppUrl()
  try {
    const accessToken = await resolveAccessToken(appUrl)
    if (!accessToken) throw new Error('Not authenticated. Please sign in again.')

    const chunks = chunkSize ? R.splitEvery(chunkSize, body) : [body]
    for (let i = 0; i < chunks.length; i += 1) {
      await setStatus(statusLabel, parseInt((i / chunks.length) * 100, 10))
      const response = await fetch(`${appUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${accessToken}`,
          'x-multi-store-player-store': storeUrl,
        },
        body: JSON.stringify(chunks[i]),
      })
      if (!response.ok) {
        const status = await response.text()
        throw new Error(`Response not ok, status: ${response.status} ${response.statusText} ${status}`)
      }
    }
    await clearStatus()
  } catch (e) {
    await reportFailure(storeUrl, path, e)
  }
}

const sendTracks = (storeUrl, type, tracks) =>
  postToFomoplayer({
    path: `/api/me/${type}`,
    body: tracks,
    storeUrl,
    statusLabel: 'Sending tracks',
    chunkSize: 100,
  })

const sendArtists = (storeUrl, artists) =>
  postToFomoplayer({
    path: `/api/me/follows/artists`,
    body: artists,
    storeUrl,
    statusLabel: 'Sending artists',
  })

const sendLabels = (storeUrl, labels) =>
  postToFomoplayer({
    path: `/api/me/follows/labels`,
    body: labels,
    storeUrl,
    statusLabel: 'Sending labels',
  })

let bandcampTracksCache = []
let currentBandcampReleaseIndex = 0
let bandcampReleases = []
let bandcampTabId
let beatportTracksCache = []

const fetchBandcampReleaseInTab = async () => {
  if (typeof bandcampTabId !== 'number') return
  const waitForTralbumData = () =>
    new Promise((resolve, reject) => {
      const startedAt = Date.now()
      const tick = () => {
        if (window.TralbumData) return resolve(window.TralbumData)
        if (Date.now() - startedAt > 15000) return reject(new Error('TralbumData timeout'))
        setTimeout(tick, 100)
      }
      tick()
    })
  try {
    const [{ result } = {}] = await browser.scripting.executeScript({
      target: { tabId: bandcampTabId },
      world: 'MAIN',
      func: waitForTralbumData,
    })
    if (!result) {
      await handleError({ message: 'Bandcamp release page did not expose window.TralbumData' })
      return
    }
    await handleMessage({
      type: 'tracks',
      store: 'bandcamp',
      data: { type: 'tracks', tracks: result },
    })
  } catch (e) {
    await handleError({ message: 'Failed to scrape Bandcamp release in tab', stack: e?.stack || String(e) })
  }
}

const fetchNextBandcampItem = async () => {
  await setStatus(
    'Fetching tracks',
    parseInt((currentBandcampReleaseIndex / bandcampReleases.length) * 100, 10),
  )
  const itemUrl = bandcampReleases[currentBandcampReleaseIndex].item_url
  if (typeof bandcampTabId === 'number') {
    try {
      await browser.tabs.remove(bandcampTabId)
    } catch (_) {}
    bandcampTabId = undefined
  }
  const tab = await browser.tabs.create({ url: itemUrl, active: false })
  bandcampTabId = tab.id
  await fetchBandcampReleaseInTab()
}

const handleMessage = async (message) => {
  if (message.type === 'operationStatus') {
    await setStatus(message.text, message.progress)
  } else if (message.type === 'clearError') {
    await clearStatus()
    await browser.storage.local.remove('error')
    broadcast({ type: 'refresh' })
  } else if (message.type === 'error') {
    await handleError(message)
  } else if (message.type === 'artists') {
    await sendArtists(BEATPORT_STORE_URL, message.data)
  } else if (message.type === 'labels') {
    await sendLabels(BEATPORT_STORE_URL, message.data)
  } else if (message.type === 'purchased') {
    if (message.store === 'beatport') {
      const transformed = beatportLibraryTransform(message.data)
      await sendTracks(BEATPORT_STORE_URL, 'purchased', transformed)
    }
  } else if (message.type === 'tracks') {
    if (message.store === 'beatport') {
      beatportTracksCache = beatportTracksCache.concat(message.data.tracks)
      if (message.done) {
        await sendTracks(BEATPORT_STORE_URL, message.data.type, beatportTracksTransform(beatportTracksCache))
        beatportTracksCache = []
      }
    } else if (message.store === 'bandcamp') {
      if (message.data.tracks) bandcampTracksCache.push(message.data.tracks)
      if (message.done || currentBandcampReleaseIndex === bandcampReleases.length - 1) {
        if (typeof bandcampTabId === 'number') {
          try {
            await browser.tabs.remove(bandcampTabId)
          } catch (_) {}
          bandcampTabId = undefined
        }
        await sendTracks(BANDCAMP_STORE_URL, message.data.type, bandcampReleasesTransform(bandcampTracksCache))
        currentBandcampReleaseIndex = 0
        bandcampTracksCache = []
        bandcampReleases = []
      } else {
        currentBandcampReleaseIndex += 1
        await fetchNextBandcampItem()
      }
    }
  } else if (message.type === 'releases') {
    bandcampReleases = bandcampReleases.concat(message.data)
    if (message.done) await fetchNextBandcampItem()
  } else if (message.type === 'logging-out') {
    const appUrl = await getAppUrl()
    await sendLogout(appUrl)
    broadcast({ type: 'refresh' })
  } else if (message.type === 'login') {
    const appUrl = await getAppUrl()
    try {
      await startExtensionLogin(appUrl)
    } catch (e) {
      console.warn('Extension login could not be started', e)
      broadcast({ type: 'login', success: false, error: e?.message })
    }
  } else if (message.type === 'auth-callback') {
    try {
      const tokens = await completeLoginFromCallback(message)
      await persistTokens(tokens)
      broadcast({ type: 'login', success: true })
    } catch (e) {
      console.warn('Extension login failed', e)
      broadcast({ type: 'login', success: false, error: e?.message })
    }
  }
}

browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  Promise.resolve()
    .then(() => handleMessage(message))
    .then(() => sendResponse({ ok: true }))
    .catch((e) => {
      console.error('Message handler failed', e)
      sendResponse({ ok: false, error: e?.message })
    })
  return true
})

;(async () => {
  const { appUrl, enabledStores } = await browser.storage.local.get(['enabledStores', 'appUrl'])
  await browser.storage.local.set({
    enabledStores: enabledStores || { beatport: true, bandcamp: true },
    appUrl: appUrl || DEFAULT_APP_URL,
  })
  await purgeLegacyTokens()
})().catch((e) => console.error('Service worker initialisation failed', e))

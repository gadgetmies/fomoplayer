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
import { ensureAudioHost, forwardToAudioHost, hasOwnDocument } from './audio-host'
// Importing audio-player has no effect in a service-worker (no DOM) but
// installs the audio host inside the Firefox background page.
import './audio-player'

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

const apiFetch = async (path, { method = 'GET', body, query, storeUrl } = {}) => {
  const appUrl = await getAppUrl()
  const accessToken = await resolveAccessToken(appUrl)
  if (!accessToken) throw new Error('Not authenticated')
  const url = new URL(`${appUrl}${path}`)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    }
  }
  const response = await fetch(url.toString(), {
    method,
    headers: {
      'Content-Type': 'application/json',
      authorization: `Bearer ${accessToken}`,
      ...(storeUrl ? { 'x-multi-store-player-store': storeUrl } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`${method} ${path} failed: ${response.status} ${response.statusText} ${text}`.trim())
  }
  if (response.status === 204) return null
  const contentType = response.headers.get('content-type') || ''
  return contentType.includes('application/json') ? response.json() : response.text()
}

const ingestBandcampReleases = async (releases) => {
  const transformed = bandcampReleasesTransform(releases)
  if (transformed.length === 0) return { tracks: [], mapping: {} }
  const result = await apiFetch('/api/me/tracks', {
    method: 'POST',
    body: transformed,
    storeUrl: BANDCAMP_STORE_URL,
    query: { return: 'mapping', skipOld: 'false' },
  })
  return { tracks: transformed, mapping: result?.mapping || {} }
}

const buildQueueItemsFromReleases = async (releases) => {
  const { mapping } = await ingestBandcampReleases(releases)
  const items = []
  for (const release of releases) {
    const releaseUrl = release.url || release.item_url || ''
    const releaseTitle = release.current?.title || release.album_title || release.title || ''
    const releaseArtist = release.artist || release.band_name || ''
    const releaseArtUrl = release.art_id
      ? `https://f4.bcbits.com/img/a${release.art_id}_10.jpg`
      : null
    for (const track of release.trackinfo || []) {
      if (!track || !track.file) continue
      const audioUrl = track.file['mp3-128'] || track.file['mp3-v0'] || Object.values(track.file)[0]
      if (!audioUrl) continue
      const bandcampId = String(track.id ?? track.track_id ?? '')
      items.push({
        bandcampId,
        fomoplayerTrackId: bandcampId ? mapping[bandcampId] || null : null,
        audioUrl,
        title: track.title || '',
        artist: track.artist || releaseArtist,
        releaseTitle,
        releaseUrl,
        releaseArtUrl,
        durationMs: Math.round((track.duration || 0) * 1000),
      })
    }
  }
  return items
}

const reportTrackHeard = async (track) => {
  if (!track || !track.fomoplayerTrackId) return
  try {
    await apiFetch(`/api/me/tracks/${track.fomoplayerTrackId}`, {
      method: 'POST',
      body: { heard: true },
    })
  } catch (e) {
    console.warn('Failed to mark track heard', e?.message)
  }
}

const getUserCarts = () => apiFetch('/api/me/carts')

const updateCartContents = (cartId, operations) =>
  apiFetch(`/api/me/carts/${cartId}/tracks`, { method: 'PATCH', body: operations })

const createUserCart = (name) => apiFetch('/api/me/carts', { method: 'POST', body: { name } })

const findOrCreateWishlistCart = async () => {
  const carts = await getUserCarts()
  const existing = (carts || []).find((c) => c.name === 'Bandcamp wishlist')
  if (existing) return existing
  return createUserCart('Bandcamp wishlist')
}

const reconcileWishlistCart = async (wishlistReleases) => {
  const { mapping } = await ingestBandcampReleases(wishlistReleases)
  const wishlistTrackIds = Object.values(mapping).filter(Boolean)
  const cart = await findOrCreateWishlistCart()
  // Use ?fetch=tracks to learn which tracks the cart already has.
  const detail = await apiFetch(`/api/me/carts/${cart.id}`)
  const existingTrackIds = new Set((detail?.tracks || []).map((t) => t.id))
  const operations = []
  for (const trackId of wishlistTrackIds) {
    if (!existingTrackIds.has(trackId)) operations.push({ op: 'add', trackId, addedAt: new Date().toISOString() })
  }
  for (const trackId of existingTrackIds) {
    if (!wishlistTrackIds.includes(trackId)) operations.push({ op: 'remove', trackId })
  }
  if (operations.length > 0) {
    await updateCartContents(cart.id, operations)
  }
  return { cartId: cart.id, addedCount: operations.filter((o) => o.op === 'add').length, removedCount: operations.filter((o) => o.op === 'remove').length }
}

const handleMessage = async (message) => {
  if (message.type && message.type.startsWith('audio:')) {
    if (hasOwnDocument()) {
      // Firefox background page hosts audio-player; that handler responds.
      return undefined
    }
    return forwardToAudioHost(message)
  }
  if (message.type === 'bandcamp:auth-status') {
    const appUrl = await getAppUrl()
    const accessToken = await resolveAccessToken(appUrl)
    return { ok: true, loggedIn: Boolean(accessToken) }
  }
  if (message.type === 'bandcamp:fetch-html') {
    // Content scripts on label pages can't fetch a release page on a
    // different bandcamp subdomain due to page-origin CORS. The worker
    // operates with extension privileges + host permissions for
    // *.bandcamp.com, so it can pull the HTML and stream it back.
    try {
      const target = new URL(message.url, 'https://bandcamp.com')
      if (!/\.bandcamp\.com$/.test(target.hostname) && target.hostname !== 'bandcamp.com') {
        return { ok: false, error: 'Refusing to fetch non-bandcamp URL' }
      }
      const response = await fetch(target.toString(), { credentials: 'include' })
      if (!response.ok) return { ok: false, error: `HTTP ${response.status}` }
      const html = await response.text()
      return { ok: true, html }
    } catch (e) {
      return { ok: false, error: e?.message || 'fetch failed' }
    }
  }
  if (message.type === 'bandcamp:enqueue' || message.type === 'bandcamp:set-queue') {
    const items = await buildQueueItemsFromReleases(message.releases || [])
    if (items.length === 0) return { ok: false, error: 'No playable tracks' }
    await ensureAudioHost()
    const audioMessage =
      message.type === 'bandcamp:enqueue'
        ? { type: 'audio:enqueue', tracks: items }
        : {
            type: 'audio:set-queue',
            tracks: items,
            startIndex: message.startIndex || 0,
            autoplay: message.autoplay !== false,
          }
    if (hasOwnDocument()) {
      await browser.runtime.sendMessage(audioMessage).catch(() => {})
    } else {
      await forwardToAudioHost(audioMessage).catch(() => {})
    }
    return { ok: true, items }
  }
  if (message.type === 'bandcamp:report-heard') {
    await reportTrackHeard(message.track)
    return { ok: true }
  }
  if (message.type === 'bandcamp:get-carts') {
    const carts = await getUserCarts()
    return { ok: true, carts }
  }
  if (message.type === 'bandcamp:create-cart') {
    const cart = await createUserCart(message.name)
    return { ok: true, cart }
  }
  if (message.type === 'bandcamp:add-to-cart') {
    const items = await buildQueueItemsFromReleases(message.releases || [])
    const trackIds = items.map((i) => i.fomoplayerTrackId).filter(Boolean)
    if (trackIds.length === 0) return { ok: false, error: 'Could not resolve any tracks' }
    const operations = trackIds.map((trackId) => ({ op: 'add', trackId, addedAt: new Date().toISOString() }))
    await updateCartContents(message.cartId, operations)
    return { ok: true, addedCount: trackIds.length }
  }
  if (message.type === 'bandcamp:remove-from-cart') {
    const operations = (message.trackIds || []).map((trackId) => ({ op: 'remove', trackId }))
    if (operations.length === 0) return { ok: true }
    await updateCartContents(message.cartId, operations)
    return { ok: true }
  }
  if (message.type === 'bandcamp:wishlist-sync') {
    const summary = await reconcileWishlistCart(message.releases || [])
    return { ok: true, ...summary }
  }
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

// `runtime.sendMessage` only reaches extension contexts (worker, popup,
// offscreen, background page) — never content scripts. The audio host
// publishes its state via runtime.sendMessage, so we relay state pushes to
// every bandcamp tab via tabs.sendMessage so the in-page player UI repaints
// on timeupdate, queue mutations, seek, and track-change.
const relayAudioStateToBandcampTabs = async (message) => {
  try {
    const tabs = await browser.tabs.query({ url: 'https://*.bandcamp.com/*' })
    await Promise.all(
      (tabs || []).map((tab) =>
        typeof tab.id === 'number'
          ? browser.tabs.sendMessage(tab.id, message).catch(() => undefined)
          : undefined,
      ),
    )
  } catch (_) {}
}

browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // The audio host emits `audio:state` broadcasts; relay them out to
  // content scripts (which can't receive runtime.sendMessage) and stop —
  // they aren't request/response.
  if (message?.type === 'audio:state') {
    relayAudioStateToBandcampTabs(message)
    return false
  }
  // On Firefox / Safari background pages the audio host shares this context
  // and registers its own listener for `audio:*` messages. Bow out so the
  // host's response isn't clobbered by ours.
  if (message?.type && message.type.startsWith('audio:') && hasOwnDocument()) {
    return false
  }
  Promise.resolve()
    .then(() => handleMessage(message))
    .then((result) => {
      if (result === undefined) return sendResponse({ ok: true })
      if (result && typeof result === 'object' && 'ok' in result) return sendResponse(result)
      return sendResponse({ ok: true, data: result })
    })
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

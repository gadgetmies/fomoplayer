// Helpers used by the service worker / background entry to talk to the audio
// host (the page that owns the <audio> element).
//
// On Chromium and Safari (MV3 service workers) the audio host runs inside a
// chrome.offscreen document spawned on demand. Service workers cannot create
// DOM, so an offscreen document is the only place an <audio> element can live
// and survive across bandcamp page navigations.
//
// On Firefox the background entry is a page that already has a DOM, so
// `audio-player.js` is loaded directly into the background page (see the
// Firefox manifest overlay). In that case we don't need offscreen — we just
// import the audio host module so it registers its own message handlers.
import browser from './browser'

const OFFSCREEN_URL = 'audio-player.html'
const OFFSCREEN_REASONS = ['AUDIO_PLAYBACK']
const OFFSCREEN_JUSTIFICATION =
  'Plays Bandcamp track previews queued from the Fomo Player extension across page navigations.'

const offscreenAvailable = () =>
  typeof chrome !== 'undefined' && chrome.offscreen && typeof chrome.offscreen.createDocument === 'function'

export const hasOwnDocument = () => typeof document !== 'undefined' && Boolean(document?.body)

let creating = null

const hasExistingOffscreen = async () => {
  if (typeof chrome === 'undefined' || !chrome.runtime || typeof chrome.runtime.getContexts !== 'function') {
    // getContexts is only present in newer Chromium. Fall back to assuming
    // the document does not exist; createDocument is idempotent-ish — we
    // catch the duplicate-creation error below.
    return false
  }
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
    })
    return contexts.length > 0
  } catch (_) {
    return false
  }
}

export const ensureAudioHost = async () => {
  if (hasOwnDocument()) return // Firefox: the background page already hosts audio-player.js
  if (!offscreenAvailable()) return
  if (await hasExistingOffscreen()) return
  if (creating) {
    await creating
    return
  }
  creating = chrome.offscreen
    .createDocument({
      url: OFFSCREEN_URL,
      reasons: OFFSCREEN_REASONS,
      justification: OFFSCREEN_JUSTIFICATION,
    })
    .catch((e) => {
      // Another caller may have created the document between our check and
      // this call, in which case Chromium throws "Only a single offscreen
      // document may be created". Treat as success.
      if (!`${e?.message || ''}`.includes('Only a single offscreen document')) {
        throw e
      }
    })
  try {
    await creating
  } finally {
    creating = null
  }
}

const FORWARD_FLAG = '__fp_forwarded'

export const forwardToAudioHost = async (message) => {
  await ensureAudioHost()
  return browser.runtime.sendMessage({ ...message, [FORWARD_FLAG]: true })
}

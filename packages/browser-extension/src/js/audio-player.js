// Audio host. Runs inside the offscreen document on Chromium / Safari and
// inside the auto-generated background page on Firefox. Owns the <audio>
// element, the playback queue, and the published state. Communicates with
// the service worker / background entry via runtime messages so content
// scripts on bandcamp.com pages can drive playback that survives navigation.
//
// In Chromium service-worker context this module is imported by the worker
// bundle but `audio` resolves to null and we no-op; the worker delegates to
// an offscreen document loaded with this same bundle that has a real DOM.
import browser from './browser'

const STATE_KEY = 'bandcampAudioState'

const hasDocument = typeof document !== 'undefined' && Boolean(document?.body || document?.documentElement)

const audio = (() => {
  if (!hasDocument) return null
  const existing = document.getElementById('fomoplayer-audio')
  if (existing) return existing
  const element = document.createElement('audio')
  element.id = 'fomoplayer-audio'
  element.preload = 'auto'
  if (document.body) {
    document.body.appendChild(element)
  } else {
    document.documentElement.appendChild(element)
  }
  return element
})()

const state = {
  queue: [],
  index: -1,
  playing: false,
  position: 0,
  duration: 0,
  loading: false,
  error: null,
}

// `runtime.sendMessage` only reaches extension contexts; content scripts
// have to be addressed through `tabs.sendMessage`. On Chromium this audio
// host runs inside an offscreen document, which has no `tabs` API — there
// the worker picks up the broadcast and relays. On Firefox / Safari the
// host runs in the background page and we can fan out directly.
const tabsApiAvailable = () => Boolean(browser.tabs && typeof browser.tabs.query === 'function')

const broadcastToBandcampTabs = async (message) => {
  if (!tabsApiAvailable()) return
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

const broadcast = () => {
  const message = { type: 'audio:state', state }
  browser.runtime.sendMessage(message).catch(() => {})
  broadcastToBandcampTabs(message)
}

const persist = async () => {
  try {
    await browser.storage.local.set({ [STATE_KEY]: state })
  } catch (_) {}
}

const restore = async () => {
  try {
    const stored = await browser.storage.local.get([STATE_KEY])
    const saved = stored?.[STATE_KEY]
    if (saved && Array.isArray(saved.queue)) {
      Object.assign(state, saved, { playing: false, loading: false, error: null })
    }
  } catch (_) {}
}

const currentTrack = () => {
  if (state.index < 0 || state.index >= state.queue.length) return null
  return state.queue[state.index]
}

const loadCurrent = async ({ resumePosition = false } = {}) => {
  const track = currentTrack()
  if (!audio || !track) return
  state.loading = true
  state.error = null
  broadcast()
  audio.src = track.audioUrl
  if (resumePosition && state.position > 0) {
    try {
      await new Promise((resolve) => {
        const onLoaded = () => {
          audio.removeEventListener('loadedmetadata', onLoaded)
          try {
            audio.currentTime = state.position
          } catch (_) {}
          resolve()
        }
        audio.addEventListener('loadedmetadata', onLoaded)
      })
    } catch (_) {}
  } else {
    state.position = 0
  }
  state.duration = track.durationMs ? track.durationMs / 1000 : 0
}

const playCurrent = async () => {
  if (!audio) return
  try {
    await audio.play()
    state.playing = true
    state.error = null
  } catch (e) {
    state.playing = false
    state.error = e?.message || String(e)
  }
  broadcast()
  await persist()
}

const setQueue = async ({ tracks, startIndex = 0, autoplay = true }) => {
  state.queue = tracks
  state.index = Math.max(0, Math.min(startIndex, tracks.length - 1))
  state.position = 0
  await loadCurrent()
  if (autoplay) {
    await playCurrent()
  } else {
    broadcast()
    await persist()
  }
}

const enqueue = async ({ tracks, playIfIdle = true }) => {
  state.queue = state.queue.concat(tracks)
  if (state.index < 0 && playIfIdle) {
    state.index = 0
    await loadCurrent()
    await playCurrent()
  } else {
    broadcast()
    await persist()
  }
}

const playAt = async (index) => {
  if (index < 0 || index >= state.queue.length) return
  state.index = index
  state.position = 0
  await loadCurrent()
  await playCurrent()
}

const next = async () => {
  if (state.index + 1 >= state.queue.length) {
    state.playing = false
    if (audio) audio.pause()
    broadcast()
    await persist()
    return
  }
  await playAt(state.index + 1)
}

const prev = async () => {
  if (audio && audio.currentTime > 3) {
    audio.currentTime = 0
    return
  }
  if (state.index - 1 < 0) return
  await playAt(state.index - 1)
}

const togglePlay = async () => {
  if (!audio) return
  if (audio.paused) {
    await playCurrent()
  } else {
    audio.pause()
  }
}

const seek = (positionSeconds) => {
  if (!audio) return
  try {
    audio.currentTime = Math.max(0, positionSeconds)
  } catch (_) {}
}

const removeAt = async (index) => {
  if (index < 0 || index >= state.queue.length) return
  state.queue.splice(index, 1)
  if (state.queue.length === 0) {
    state.index = -1
    state.playing = false
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    broadcast()
    await persist()
    return
  }
  if (index < state.index) {
    state.index -= 1
  } else if (index === state.index) {
    state.index = Math.min(state.index, state.queue.length - 1)
    await loadCurrent()
    if (state.playing) await playCurrent()
    return
  }
  broadcast()
  await persist()
}

const clearQueue = async () => {
  state.queue = []
  state.index = -1
  state.playing = false
  state.position = 0
  if (audio) {
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  }
  broadcast()
  await persist()
}

const reportHeard = (track) => {
  browser.runtime
    .sendMessage({ type: 'bandcamp:report-heard', track })
    .catch(() => {})
}

if (audio) {
  audio.addEventListener('play', () => {
    state.playing = true
    state.loading = false
    broadcast()
    const track = currentTrack()
    if (track) reportHeard(track)
  })
  audio.addEventListener('pause', () => {
    state.playing = false
    broadcast()
    persist()
  })
  audio.addEventListener('ended', () => {
    next()
  })
  audio.addEventListener('timeupdate', () => {
    state.position = audio.currentTime || 0
    if (Math.floor(state.position) !== Math.floor(state._lastBroadcastPosition || 0)) {
      state._lastBroadcastPosition = state.position
      broadcast()
    }
  })
  audio.addEventListener('loadedmetadata', () => {
    state.duration = audio.duration || state.duration
    broadcast()
  })
  audio.addEventListener('error', () => {
    state.error = 'Playback failed'
    state.playing = false
    state.loading = false
    broadcast()
  })
  audio.addEventListener('canplay', () => {
    state.loading = false
    broadcast()
  })
}

const messageHandlers = {
  'audio:set-queue': (msg) => setQueue(msg),
  'audio:enqueue': (msg) => enqueue(msg),
  'audio:play-at': (msg) => playAt(msg.index),
  'audio:toggle': () => togglePlay(),
  'audio:play': () => playCurrent(),
  'audio:pause': () => audio && audio.pause(),
  'audio:next': () => next(),
  'audio:prev': () => prev(),
  'audio:seek': (msg) => seek(msg.position),
  'audio:remove-at': (msg) => removeAt(msg.index),
  'audio:clear': () => clearQueue(),
  'audio:get-state': () => Promise.resolve({ state }),
}

export const AUDIO_FORWARD_FLAG = '__fp_forwarded'

const isOffscreenContext =
  typeof window !== 'undefined' && /audio-player\.html$/.test(window.location?.pathname || '')

if (audio) {
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // In Chromium offscreen context: only handle forwarded messages so the
    // direct broadcast doesn't double-fire (the worker forwards it).
    // In Firefox / Safari background pages: handle direct broadcasts since
    // the worker bows out of audio:* messages there.
    if (isOffscreenContext && !message?.[AUDIO_FORWARD_FLAG]) return undefined
    const handler = messageHandlers[message?.type]
    if (!handler) return undefined
    Promise.resolve()
      .then(() => handler(message))
      .then((result) => sendResponse(result || { ok: true }))
      .catch((e) => sendResponse({ ok: false, error: e?.message }))
    return true
  })

  ;(async () => {
    await restore()
    if (state.queue.length > 0 && state.index >= 0) {
      await loadCurrent({ resumePosition: true })
    }
    broadcast()
  })().catch((e) => console.warn('audio-player init failed', e))
}

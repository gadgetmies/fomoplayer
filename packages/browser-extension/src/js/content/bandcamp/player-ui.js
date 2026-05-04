// Sticky bottom player UI rendered into a shadow DOM on every bandcamp page.
// State is fed by the audio host via the `audio:state` runtime broadcast;
// transport actions are sent back through the worker, which forwards to the
// offscreen / background audio host.
import browser from '../../browser'

const HOST_ID = 'fomoplayer-bandcamp-player-host'

const sendToWorker = (message) => browser.runtime.sendMessage(message).catch(() => null)

const formatTime = (seconds) => {
  if (!seconds || !Number.isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const STYLE = `
  :host { all: initial; position: fixed; bottom: 0; left: 0; right: 0; z-index: 2147483646; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
  .player {
    background: #1a1a1a; color: #f1f1f1;
    border-top: 1px solid #2c2c2c;
    box-shadow: 0 -4px 18px rgba(0,0,0,0.45);
    padding: 8px 12px 10px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 12px;
  }
  .player.hidden { display: none; }
  .meta { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .art { width: 40px; height: 40px; background: #333; border-radius: 2px; flex: none; background-size: cover; background-position: center; }
  .meta-text { min-width: 0; }
  .title { font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .artist { font-size: 12px; color: #b8b8b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .release-link { color: inherit; text-decoration: none; }
  .release-link:hover { text-decoration: underline; }
  .controls { display: flex; gap: 4px; align-items: center; }
  button.t {
    background: transparent; border: 1px solid transparent; color: #f1f1f1; cursor: pointer;
    width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    padding: 0;
  }
  button.t:hover:not(:disabled) { background: #2c2c2c; }
  button.t:disabled { opacity: 0.4; cursor: default; }
  button.play { width: 40px; height: 40px; background: #1da0c3; }
  button.play:hover:not(:disabled) { background: #2bb1d4; }
  button.play svg { fill: #fff; }
  svg { width: 16px; height: 16px; fill: currentColor; }
  .right { display: flex; align-items: center; justify-content: flex-end; gap: 10px; min-width: 0; }
  .progress { flex: 1; min-width: 100px; max-width: 320px; display: flex; align-items: center; gap: 6px; font-size: 11px; color: #b8b8b8; }
  .bar { flex: 1; height: 4px; background: #2c2c2c; border-radius: 2px; cursor: pointer; position: relative; }
  .bar-fill { position: absolute; top: 0; left: 0; bottom: 0; background: #1da0c3; border-radius: 2px; }
  .queue-toggle { background: transparent; border: 1px solid #2c2c2c; color: #ddd; padding: 4px 10px; font-size: 11px; border-radius: 14px; cursor: pointer; }
  .queue-toggle:hover { background: #2c2c2c; }
  .queue { background: #1a1a1a; color: #f1f1f1; border-top: 1px solid #2c2c2c; max-height: 220px; overflow-y: auto; padding: 6px 0; }
  .queue.hidden { display: none; }
  .qrow { display: grid; grid-template-columns: 24px 1fr auto; gap: 8px; align-items: center; padding: 4px 12px; font-size: 12px; cursor: pointer; }
  .qrow:hover { background: #232323; }
  .qrow.active { background: #20323a; }
  .qrow .qtitle { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .qrow .qartist { color: #888; font-size: 11px; }
  .qrow .remove { background: transparent; border: none; color: #888; cursor: pointer; }
  .qrow .remove:hover { color: #f1f1f1; }
  .empty { padding: 8px 12px; color: #888; font-size: 12px; text-align: center; }
`

const ICON = {
  play: '<svg viewBox="0 0 16 16"><path d="M3 2 L13 8 L3 14 Z"/></svg>',
  pause: '<svg viewBox="0 0 16 16"><rect x="3" y="2" width="3" height="12"/><rect x="10" y="2" width="3" height="12"/></svg>',
  prev: '<svg viewBox="0 0 16 16"><rect x="2" y="2" width="2" height="12"/><path d="M14 2 L5 8 L14 14 Z"/></svg>',
  next: '<svg viewBox="0 0 16 16"><rect x="12" y="2" width="2" height="12"/><path d="M2 2 L11 8 L2 14 Z"/></svg>',
  close: '<svg viewBox="0 0 16 16"><path d="M3 3 L13 13 M13 3 L3 13" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
}

const renderShell = (root) => {
  const html = `
    <style>${STYLE}</style>
    <div class="queue hidden" data-q></div>
    <div class="player hidden" data-player>
      <div class="meta">
        <div class="art" data-art></div>
        <div class="meta-text">
          <div class="title" data-title></div>
          <div class="artist"><span data-artist></span> &middot; <a class="release-link" data-release-link target="_blank" rel="noopener noreferrer"><span data-release></span></a></div>
        </div>
      </div>
      <div class="controls">
        <button class="t" data-prev title="Previous">${ICON.prev}</button>
        <button class="t play" data-play title="Play / Pause">${ICON.play}</button>
        <button class="t" data-next title="Next">${ICON.next}</button>
      </div>
      <div class="right">
        <div class="progress">
          <span data-current>0:00</span>
          <div class="bar" data-bar><div class="bar-fill" data-bar-fill></div></div>
          <span data-duration>0:00</span>
        </div>
        <button class="queue-toggle" data-queue-toggle>Queue</button>
        <button class="t" data-clear title="Clear queue">${ICON.close}</button>
      </div>
    </div>
  `
  root.innerHTML = html
}

let state = {
  queue: [],
  index: -1,
  playing: false,
  position: 0,
  duration: 0,
}

let host
let shadow
let refs = {}
// Cache of last-rendered values so renderState can skip writes for fields
// that haven't changed. The audio host pushes state once per playback
// second, so without this guard the entire queue list gets rebuilt and its
// listeners re-attached every tick.
let lastRender = {}
const resetRenderCache = () => {
  lastRender = {
    hasTrack: null,
    trackKey: '',
    playing: null,
    index: -1,
    duration: -1,
    positionSecond: -1,
    queueSignature: '',
  }
}
resetRenderCache()

const ensureHost = () => {
  if (host) return
  const existing = document.getElementById(HOST_ID)
  if (existing) {
    host = existing
    shadow = host.shadowRoot
  } else {
    host = document.createElement('div')
    host.id = HOST_ID
    document.documentElement.appendChild(host)
    shadow = host.attachShadow({ mode: 'open' })
  }
  renderShell(shadow)
  // The DOM is freshly stamped — discard any stale diff cache so the first
  // renderState() actually paints initial values into it.
  resetRenderCache()
  refs = {
    player: shadow.querySelector('[data-player]'),
    queue: shadow.querySelector('[data-q]'),
    queueToggle: shadow.querySelector('[data-queue-toggle]'),
    art: shadow.querySelector('[data-art]'),
    title: shadow.querySelector('[data-title]'),
    artist: shadow.querySelector('[data-artist]'),
    release: shadow.querySelector('[data-release]'),
    releaseLink: shadow.querySelector('[data-release-link]'),
    play: shadow.querySelector('[data-play]'),
    prev: shadow.querySelector('[data-prev]'),
    next: shadow.querySelector('[data-next]'),
    current: shadow.querySelector('[data-current]'),
    duration: shadow.querySelector('[data-duration]'),
    bar: shadow.querySelector('[data-bar]'),
    barFill: shadow.querySelector('[data-bar-fill]'),
    clear: shadow.querySelector('[data-clear]'),
  }
  bindEvents()
}

const bindEvents = () => {
  refs.play.addEventListener('click', () => sendToWorker({ type: 'audio:toggle' }))
  refs.prev.addEventListener('click', () => sendToWorker({ type: 'audio:prev' }))
  refs.next.addEventListener('click', () => sendToWorker({ type: 'audio:next' }))
  refs.clear.addEventListener('click', () => sendToWorker({ type: 'audio:clear' }))
  refs.queueToggle.addEventListener('click', () => {
    refs.queue.classList.toggle('hidden')
  })
  refs.bar.addEventListener('click', (e) => {
    if (!state.duration) return
    const rect = refs.bar.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    sendToWorker({ type: 'audio:seek', position: ratio * state.duration })
  })
}

const renderEmptyState = () => {
  refs.player.classList.remove('hidden')
  refs.queue.classList.add('hidden')
  refs.title.textContent = 'Fomo Player'
  refs.artist.textContent = 'Click "Queue" next to a Bandcamp track or release'
  refs.release.textContent = ''
  refs.releaseLink.removeAttribute('href')
  refs.art.style.backgroundImage = ''
  refs.play.innerHTML = ICON.play
  refs.play.disabled = true
  refs.prev.disabled = true
  refs.next.disabled = true
  refs.current.textContent = '0:00'
  refs.duration.textContent = '0:00'
  refs.barFill.style.width = '0%'
}

const updateActiveRow = () => {
  refs.queue.querySelectorAll('.qrow').forEach((row) => {
    const idx = Number(row.dataset.i)
    row.classList.toggle('active', idx === state.index)
  })
}

const rebuildQueue = () => {
  refs.queue.innerHTML = state.queue
    .map(
      (q, i) => `
        <div class="qrow ${i === state.index ? 'active' : ''}" data-i="${i}">
          <div>${i + 1}.</div>
          <div>
            <div class="qtitle">${escapeHtml(q.title || '')}</div>
            <div class="qartist">${escapeHtml(q.artist || '')}</div>
          </div>
          <button class="remove" data-remove="${i}" title="Remove">${ICON.close}</button>
        </div>
      `,
    )
    .join('')
  refs.queue.querySelectorAll('.qrow').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-remove]')) return
      const idx = Number(row.dataset.i)
      sendToWorker({ type: 'audio:play-at', index: idx })
    })
  })
  refs.queue.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const idx = Number(btn.dataset.remove)
      sendToWorker({ type: 'audio:remove-at', index: idx })
    })
  })
}

const renderState = () => {
  if (!host) return
  const track = state.queue[state.index]
  const hasTrack = Boolean(track)

  if (hasTrack !== lastRender.hasTrack) {
    if (!hasTrack) renderEmptyState()
    else {
      refs.player.classList.remove('hidden')
      refs.play.disabled = false
    }
    lastRender.hasTrack = hasTrack
  }
  if (!hasTrack) return

  // Track-level info — only repaint when the active track changes.
  const trackKey = `${track.bandcampId || track.audioUrl || ''}|${track.title || ''}|${track.artist || ''}`
  if (trackKey !== lastRender.trackKey) {
    refs.title.textContent = track.title || ''
    refs.artist.textContent = track.artist || ''
    refs.release.textContent = track.releaseTitle || ''
    refs.releaseLink.href = track.releaseUrl || '#'
    refs.art.style.backgroundImage = track.releaseArtUrl ? `url("${track.releaseArtUrl}")` : ''
    lastRender.trackKey = trackKey
  }

  if (state.playing !== lastRender.playing) {
    refs.play.innerHTML = state.playing ? ICON.pause : ICON.play
    refs.play.title = state.playing ? 'Pause' : 'Play'
    lastRender.playing = state.playing
  }

  // Queue contents — rebuild when track identities or length change. The
  // active-row highlight is handled separately via class toggling so a
  // simple seek inside the same track doesn't reflow the whole list.
  const queueSignature = state.queue.map((q) => q.bandcampId || q.audioUrl || '').join('|')
  if (queueSignature !== lastRender.queueSignature) {
    rebuildQueue()
    lastRender.queueSignature = queueSignature
  }

  if (state.index !== lastRender.index) {
    refs.prev.disabled = state.index <= 0
    refs.next.disabled = state.index >= state.queue.length - 1
    updateActiveRow()
    lastRender.index = state.index
  }

  if (state.duration !== lastRender.duration) {
    refs.duration.textContent = formatTime(state.duration)
    lastRender.duration = state.duration
  }

  // Position — broadcasts already throttle to once per second, but track
  // the second locally so a no-op state push doesn't even touch the DOM.
  const positionSecond = Math.floor(state.position || 0)
  if (positionSecond !== lastRender.positionSecond) {
    refs.current.textContent = formatTime(state.position)
    refs.barFill.style.width = state.duration
      ? `${Math.min(100, (state.position / state.duration) * 100)}%`
      : '0%'
    lastRender.positionSecond = positionSecond
  }
}

const escapeHtml = (s) =>
  String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export const setVisible = (visible) => {
  if (visible) {
    ensureHost()
    renderState()
  } else if (host) {
    host.remove()
    host = undefined
    shadow = undefined
    refs = {}
  }
}

let listenerInstalled = false

export const installPlayerUi = async () => {
  ensureHost()
  // Pull initial state from the audio host.
  const response = await sendToWorker({ type: 'audio:get-state' })
  if (response?.state) {
    state = { ...state, ...response.state }
    renderState()
  } else if (response?.data?.state) {
    state = { ...state, ...response.data.state }
    renderState()
  }
  if (listenerInstalled) return
  listenerInstalled = true
  browser.runtime.onMessage.addListener((message) => {
    if (message?.type === 'audio:state') {
      state = { ...state, ...message.state }
      renderState()
    }
  })
}

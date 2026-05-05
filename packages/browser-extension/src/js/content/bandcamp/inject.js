// Injects Fomo Player buttons into bandcamp pages: per-track cue button +
// per-release "add to cart" dropdown on release pages, and a cart dropdown
// next to each item on discography listings.
import browser from '../../browser'
import { readTralbumData, releaseWithSingleTrack, fetchReleaseTralbum } from './scrape'
import { renderCartButton } from './cart-button'
import { SPINNER_CSS, spinnerHTML } from './spinner'
import { incrementPendingAdds, decrementPendingAdds } from './pending-adds'
import { colors } from 'fomoplayer_shared/theme'

// Marker attribute used to skip re-injection when the MutationObserver
// re-fires. Lowercase + hyphenated so it round-trips through `dataset` and
// CSS attribute selectors without case-folding collisions — the previous
// camelCase name silently broke the dedup check and caused an injection
// loop.
const INJECTED_ATTR = 'data-fp-injected'

const sendToWorker = (message) => browser.runtime.sendMessage(message).catch(() => null)

const REQUEST_TIMEOUT_MS = 30000

const withTimeout = (promise, ms = REQUEST_TIMEOUT_MS) =>
  Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: 'Request timed out' }), ms)),
  ])

const ERROR_FLASH_MS = 1800

// Both album (`/album/...`) and single-track (`/track/...`) pages render a
// `#name-section` and expose `window.TralbumData`. Either signal is enough
// to treat the page as a release-level page.
const onReleasePage = () => Boolean(document.querySelector('#name-section'))
const onDiscographyPage = () =>
  Boolean(document.querySelector('.music-grid, #music-grid, .leftMiddleColumns .music-grid-item'))
// Bandcamp's per-user feed lives at `bandcamp.com/<user>/feed`. The path
// can have a trailing slash; query / hash variants stay on the same path.
const onFeedPage = () => /\/feed\/?$/.test(location.pathname)

// `onClick` may return a Promise resolving to `{ ok, error }` (e.g., the
// worker response from `bandcamp:enqueue`). The button shows a spinner and
// disables itself for the lifetime of that promise, then either returns to
// idle or briefly flashes an error indication. Pending counts are reported
// to pending-adds.js so the embedded player can show an "Adding…" row.
//
// The label stays in the DOM (visibility: hidden) while pending; the spinner
// overlays absolutely. That keeps the button's footprint identical between
// idle and loading so neighbouring controls don't shift.
const cueButton = ({ onClick, label = 'Queue', iconOnly = false, icon = '' }) => {
  const host = document.createElement('span')
  const shadow = host.attachShadow({ mode: 'open' })
  const titleAttr = iconOnly ? ` title="${label.replace(/"/g, '&quot;')}"` : ''
  const inner = iconOnly && icon
    ? `<span data-icon aria-hidden="true">${icon}</span>`
    : `<span data-label>${label}</span>`
  shadow.innerHTML = `
    <style>
      :host { all: initial; display: inline-flex; align-items: center; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
      button {
        background: transparent; color: #fff; border: 1px solid ${colors.brandPrimary};
        font-size: 11px; padding: 2px 8px; border-radius: 3px; cursor: pointer;
        line-height: 1.4; display: inline-flex; align-items: center; gap: 4px;
        position: relative;
      }
      button:hover:not(:disabled) { background: ${colors.brandPrimary}; color: #fff; }
      button[disabled] { cursor: progress; opacity: 0.85; }
      button[data-state="error"] { background: transparent; border-color: #c63; color: #c63; }
      button[data-state="loading"] [data-label],
      button[data-state="loading"] [data-icon] { visibility: hidden; }
      button[data-icon-only] { padding: 3px; }
      button[data-icon-only] [data-icon] { display: inline-flex; align-items: center; justify-content: center; }
      [data-icon] svg { display: block; width: 12px; height: 12px; fill: currentColor; }
      [data-spinner] {
        position: absolute; top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        display: none;
      }
      button[data-state="loading"] [data-spinner] { display: inline-flex; align-items: center; justify-content: center; }
      [data-spinner] .loading-indicator { margin-left: 0; }
      ${SPINNER_CSS}
    </style>
    <button${iconOnly ? ' data-icon-only="1"' : ''}${titleAttr}>
      ${inner}
      <span data-spinner aria-hidden="true">${spinnerHTML('#fff')}</span>
    </button>
  `
  const buttonEl = shadow.querySelector('button')
  let pending = false
  let resetTimer = null

  const setIdle = () => {
    pending = false
    buttonEl.disabled = false
    delete buttonEl.dataset.state
    buttonEl.title = ''
  }

  const setError = (errorText) => {
    pending = false
    buttonEl.disabled = false
    buttonEl.dataset.state = 'error'
    buttonEl.title = errorText || 'Failed to add to queue'
    if (resetTimer) clearTimeout(resetTimer)
    resetTimer = setTimeout(setIdle, ERROR_FLASH_MS)
  }

  buttonEl.addEventListener('click', async (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (pending) return
    if (resetTimer) {
      clearTimeout(resetTimer)
      resetTimer = null
    }
    pending = true
    buttonEl.disabled = true
    buttonEl.dataset.state = 'loading'
    incrementPendingAdds()
    try {
      const result = await withTimeout(Promise.resolve().then(() => onClick()))
      if (result && result.ok === false) {
        console.warn('Fomo Player queue add failed', result.error)
        setError(result.error)
      } else {
        setIdle()
      }
    } catch (err) {
      console.warn('Fomo Player queue add threw', err)
      setError(err?.message)
    } finally {
      decrementPendingAdds()
    }
  })
  return host
}

const buttonContainer = () => {
  const wrap = document.createElement('span')
  wrap.setAttribute(INJECTED_ATTR, '1')
  wrap.style.cssText =
    'display: inline-flex; gap: 6px; align-items: center; vertical-align: middle; ' +
    'background: rgba(0, 0, 0, 0.55); border-radius: 6px; padding: 4px 6px;'
  return wrap
}

const injectReleaseLevelButtons = async () => {
  const release = await readTralbumData()
  if (!release || !Array.isArray(release.trackinfo)) return null

  const titleSection = document.querySelector('#name-section') || document.querySelector('h2.trackTitle')
  if (titleSection && !titleSection.querySelector(`[${INJECTED_ATTR}]`)) {
    const wrap = buttonContainer()
    wrap.appendChild(
      cueButton({
        label: 'Play',
        onClick: () => sendToWorker({ type: 'bandcamp:enqueue', releases: [release], playNow: true }),
      }),
    )
    wrap.appendChild(
      cueButton({
        label: 'Queue',
        onClick: () => sendToWorker({ type: 'bandcamp:enqueue', releases: [release] }),
      }),
    )
    wrap.appendChild(
      renderCartButton({
        label: 'Add to Fomo',
        getReleases: () => [release],
      }),
    )
    titleSection.appendChild(wrap)
  }

  const trackRows = document.querySelectorAll('.track_table tr.track_row_view')
  trackRows.forEach((row) => {
    if (row.querySelector(`[${INJECTED_ATTR}]`)) return
    const playButton = row.querySelector('.play-col, .play_status, .play')
    const trackTitleCell = row.querySelector('.track-title') || row.querySelector('.title-col')
    if (!trackTitleCell) return
    const trackId = extractTrackIdFromRow(row, release)
    if (!trackId) return
    const wrap = buttonContainer()
    wrap.appendChild(
      cueButton({
        label: 'Play',
        onClick: () => {
          const slim = releaseWithSingleTrack(release, trackId)
          if (!slim) return { ok: false, error: 'Could not resolve track' }
          return sendToWorker({ type: 'bandcamp:enqueue', releases: [slim], playNow: true })
        },
      }),
    )
    wrap.appendChild(
      cueButton({
        label: 'Queue',
        onClick: () => {
          const slim = releaseWithSingleTrack(release, trackId)
          if (!slim) return { ok: false, error: 'Could not resolve track' }
          return sendToWorker({ type: 'bandcamp:enqueue', releases: [slim] })
        },
      }),
    )
    wrap.appendChild(
      renderCartButton({
        label: 'Add to Fomo',
        getReleases: () => {
          const slim = releaseWithSingleTrack(release, trackId)
          return slim ? [slim] : []
        },
      }),
    )
    const timeSpan = row.querySelector('.time')
    if (timeSpan) {
      timeSpan.insertAdjacentElement('afterend', wrap)
    } else {
      trackTitleCell.appendChild(wrap)
    }
    void playButton
  })

  return release
}

const extractTrackIdFromRow = (row, release) => {
  // Bandcamp puts the track number on the row itself as `rel="tracknum=N"`.
  const rel = row.getAttribute('rel') || ''
  const relMatch = rel.match(/tracknum=(\d+)/)
  if (relMatch) {
    const info = release.trackinfo?.[Number(relMatch[1]) - 1]
    if (info?.id) return String(info.id)
  }
  const trackNum = row.querySelector('.track-number-col, .track_number')?.textContent
  if (trackNum) {
    const idx = parseInt(trackNum, 10) - 1
    const info = release.trackinfo?.[idx]
    if (info?.id) return String(info.id)
  }
  const titleEl = row.querySelector('.track-title, .title-col a')
  if (titleEl) {
    const title = titleEl.textContent.trim().toLowerCase()
    const match = (release.trackinfo || []).find((t) => (t.title || '').trim().toLowerCase() === title)
    if (match?.id) return String(match.id)
  }
  return null
}

const OVERLAY_POSITION_CSS = 'position: absolute; top: 6px; right: 6px; z-index: 5;'

const injectDiscographyButtons = () => {
  const items = document.querySelectorAll('#music-grid > li, .music-grid-item')
  items.forEach((item) => {
    if (item.querySelector(`[${INJECTED_ATTR}]`)) return
    const link = item.querySelector('a[href*="/album/"], a[href*="/track/"]')
    if (!link) return
    const href = link.getAttribute('href')
    const wrap = buttonContainer()
    wrap.style.cssText += OVERLAY_POSITION_CSS
    if (getComputedStyle(item).position === 'static') {
      item.style.position = 'relative'
    }
    const getReleases = async () => {
      const release = await fetchReleaseTralbum(href)
      return release ? [release] : []
    }
    wrap.appendChild(
      cueButton({
        label: 'Play',
        onClick: async () => {
          const releases = await getReleases()
          if (releases.length === 0) return { ok: false, error: 'Could not load release' }
          return sendToWorker({ type: 'bandcamp:enqueue', releases, playNow: true })
        },
      }),
    )
    wrap.appendChild(
      cueButton({
        label: 'Queue',
        onClick: async () => {
          const releases = await getReleases()
          if (releases.length === 0) return { ok: false, error: 'Could not load release' }
          return sendToWorker({ type: 'bandcamp:enqueue', releases })
        },
      }),
    )
    wrap.appendChild(
      renderCartButton({
        label: 'Add to Fomo',
        getReleases,
      }),
    )
    item.appendChild(wrap)
  })
}

const PLAY_ICON_SVG =
  '<svg viewBox="0 0 16 16"><path d="M3 2 L13 8 L3 14 Z" fill="currentColor"/></svg>'
const PLUS_ICON_SVG =
  '<svg viewBox="0 0 16 16"><path d="M8 3 v10 M3 8 h10" stroke="currentColor" stroke-width="2" fill="none"/></svg>'

const FEED_TILE_ANCESTOR_SELECTOR =
  'li, .story-innards, .collection-item-container, .story-fan-collection-item, [data-tralbum-id]'

const findFeedHrefForAux = (mount) => {
  if (mount.tagName === 'A') {
    const h = mount.getAttribute('href') || ''
    if (h.includes('/album/') || h.includes('/track/')) return h
  }
  const item = mount.closest(FEED_TILE_ANCESTOR_SELECTOR) || mount.parentElement
  const link = item?.querySelector('a[href*="/album/"], a[href*="/track/"]')
  return link?.getAttribute('href') || null
}

const injectFeedButtons = () => {
  const mounts = document.querySelectorAll('.track_play_auxiliary')
  mounts.forEach((mount) => {
    if (mount.querySelector(`[${INJECTED_ATTR}]`)) return
    const href = findFeedHrefForAux(mount)
    if (!href) return
    const compact = Boolean(mount.closest('#new-releases-vm'))
    const wrap = buttonContainer()
    wrap.style.cssText += OVERLAY_POSITION_CSS
    if (getComputedStyle(mount).position === 'static') {
      mount.style.position = 'relative'
    }
    const getReleases = async () => {
      const release = await fetchReleaseTralbum(href)
      return release ? [release] : []
    }
    wrap.appendChild(
      cueButton({
        label: 'Play',
        iconOnly: compact,
        icon: PLAY_ICON_SVG,
        onClick: async () => {
          const releases = await getReleases()
          if (releases.length === 0) return { ok: false, error: 'Could not load release' }
          return sendToWorker({ type: 'bandcamp:enqueue', releases, playNow: true })
        },
      }),
    )
    wrap.appendChild(
      cueButton({
        label: 'Queue',
        iconOnly: compact,
        icon: PLUS_ICON_SVG,
        onClick: async () => {
          const releases = await getReleases()
          if (releases.length === 0) return { ok: false, error: 'Could not load release' }
          return sendToWorker({ type: 'bandcamp:enqueue', releases })
        },
      }),
    )
    wrap.appendChild(
      renderCartButton({
        label: 'Add to Fomo',
        iconOnly: compact,
        getReleases,
      }),
    )
    mount.appendChild(wrap)
  })
}

let observer
let scheduled = false
const reinjectSoon = () => {
  if (scheduled) return
  scheduled = true
  setTimeout(async () => {
    scheduled = false
    try {
      if (onReleasePage()) {
        await injectReleaseLevelButtons()
      }
      if (onDiscographyPage()) {
        injectDiscographyButtons()
      }
      if (onFeedPage()) {
        injectFeedButtons()
      }
    } catch (e) {
      console.warn('Fomo Player bandcamp inject failed', e)
    }
  }, 250)
}

export const installInjections = () => {
  reinjectSoon()
  if (!observer) {
    observer = new MutationObserver(() => reinjectSoon())
    observer.observe(document.documentElement, { subtree: true, childList: true })
  }
}

export const removeInjections = () => {
  if (observer) {
    observer.disconnect()
    observer = undefined
  }
  document.querySelectorAll(`[${INJECTED_ATTR}]`).forEach((el) => el.remove())
}

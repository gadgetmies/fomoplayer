// Injects Fomo Player buttons into bandcamp pages: per-track cue button +
// per-release "add to cart" dropdown on release pages, and a cart dropdown
// next to each item on discography listings.
import browser from '../../browser'
import { readTralbumData, releaseWithSingleTrack, fetchReleaseTralbum } from './scrape'
import { renderCartButton } from './cart-button'
import { SPINNER_CSS, spinnerHTML } from './spinner'
import { incrementPendingAdds, decrementPendingAdds } from './pending-adds'

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
const cueButton = ({ onClick, label = 'Queue', variant = 'default' }) => {
  const host = document.createElement('span')
  const shadow = host.attachShadow({ mode: 'open' })
  const spinnerColor = variant === 'overlay' ? '#fff' : '#0687f5'
  shadow.innerHTML = `
    <style>
      :host { all: initial; display: inline-flex; align-items: center; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
      button {
        background: transparent; color: #0687f5; border: 1px solid #0687f5;
        font-size: 11px; padding: 2px 8px; border-radius: 3px; cursor: pointer;
        line-height: 1.4; display: inline-flex; align-items: center; gap: 4px;
        position: relative;
      }
      button:hover:not(:disabled) { background: #0687f5; color: #fff; }
      button[disabled] { cursor: progress; opacity: 0.85; }
      button[data-state="error"] { border-color: #c63; color: #c63; }
      button[data-state="loading"] [data-label] { visibility: hidden; }
      button[data-variant="overlay"] {
        background: #b40089; color: #fff; border-color: #530059;
      }
      button[data-variant="overlay"]:hover:not(:disabled) { background: #9f0076; color: #fff; }
      button[data-variant="overlay"][data-state="error"] { background: #b40089; border-color: #c63; color: #c63; }
      [data-spinner] {
        position: absolute; top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        display: none;
      }
      button[data-state="loading"] [data-spinner] { display: inline-flex; align-items: center; justify-content: center; }
      [data-spinner] .loading-indicator { margin-left: 0; }
      ${SPINNER_CSS}
    </style>
    <button data-variant="${variant}">
      <span data-label>${label}</span>
      <span data-spinner aria-hidden="true">${spinnerHTML(spinnerColor)}</span>
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
  wrap.style.cssText = 'display: inline-flex; gap: 6px; align-items: center; vertical-align: middle;'
  return wrap
}

const injectReleaseLevelButtons = async () => {
  const release = await readTralbumData()
  if (!release || !Array.isArray(release.trackinfo)) return null

  // `/track/...` pages render the same shell as `/album/...` pages but
  // describe a single track. Reflect that in the labels so users don't see
  // "Queue release" when looking at a single track.
  const isSingleTrack = release.item_type === 'track' || /\/track\//.test(location.pathname)
  const releaseLabel = isSingleTrack ? 'track' : 'release'

  const titleSection = document.querySelector('#name-section') || document.querySelector('h2.trackTitle')
  if (titleSection && !titleSection.querySelector(`[${INJECTED_ATTR}]`)) {
    const wrap = buttonContainer()
    wrap.appendChild(
      cueButton({
        label: `Play ${releaseLabel}`,
        onClick: () => sendToWorker({ type: 'bandcamp:enqueue', releases: [release], playNow: true }),
      }),
    )
    wrap.appendChild(
      cueButton({
        label: `Queue ${releaseLabel}`,
        onClick: () => sendToWorker({ type: 'bandcamp:enqueue', releases: [release] }),
      }),
    )
    wrap.appendChild(
      renderCartButton({
        label: `Add ${releaseLabel} to Fomo Player`,
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
        label: 'Add to Fomo Player',
        getReleases: () => {
          const slim = releaseWithSingleTrack(release, trackId)
          return slim ? [slim] : []
        },
      }),
    )
    // Mount the wrap as the immediate next sibling of the row's `.time`
    // span when present — Bandcamp's row layout aligns naturally to that
    // anchor, so we don't need a left-margin shim. Older / unusual rows
    // without `.time` fall back to appending into the title cell.
    const timeSpan = row.querySelector('.time')
    if (timeSpan) {
      timeSpan.insertAdjacentElement('afterend', wrap)
    } else {
      trackTitleCell.appendChild(wrap)
    }
    if (playButton) {
      // best-effort: keep play column tidy
    }
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

// Cover-overlay surfaces (discography tiles + feed entries) sit on top of
// cover art. They use the Fomo Player magenta palette and a
// semi-transparent dark backdrop so the buttons stay readable over any
// image. Other surfaces (release-title section, per-track rows) leave
// the wrap on the bare row layout with the Bandcamp-blue palette.
const OVERLAY_WRAP_CSS =
  'position: absolute; top: 6px; right: 6px; z-index: 5; background: rgba(0, 0, 0, 0.55); border-radius: 6px; padding: 4px 6px;'

const injectDiscographyButtons = () => {
  const items = document.querySelectorAll('#music-grid > li, .music-grid-item')
  items.forEach((item) => {
    if (item.querySelector(`[${INJECTED_ATTR}]`)) return
    const link = item.querySelector('a[href*="/album/"], a[href*="/track/"]')
    if (!link) return
    const href = link.getAttribute('href')
    const wrap = buttonContainer()
    wrap.style.cssText += OVERLAY_WRAP_CSS
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
        variant: 'overlay',
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
        variant: 'overlay',
        onClick: async () => {
          const releases = await getReleases()
          if (releases.length === 0) return { ok: false, error: 'Could not load release' }
          return sendToWorker({ type: 'bandcamp:enqueue', releases })
        },
      }),
    )
    wrap.appendChild(
      renderCartButton({
        label: 'Fomo',
        variant: 'overlay',
        getReleases,
      }),
    )
    item.appendChild(wrap)
  })
}

// Bandcamp feed entries link to `/album/...` or `/track/...`. Every other
// entry type (community posts, "now following" notifications) is skipped
// because there is no playable target. We pick the nearest stable
// ancestor — feed markup uses class names that change over time, so we
// climb to the first one we recognise and fall back to `<li>` otherwise.
const FEED_CONTAINER_SELECTOR =
  '.story-innards, .collection-item-container, .story-fan-collection-item, li'

const findFeedContainer = (link) => {
  const container = link.closest(FEED_CONTAINER_SELECTOR)
  return container && container !== document.body ? container : null
}

const injectFeedButtons = () => {
  const links = document.querySelectorAll('a[href*="/album/"], a[href*="/track/"]')
  const seen = new Set()
  links.forEach((link) => {
    const container = findFeedContainer(link)
    if (!container || seen.has(container)) return
    seen.add(container)
    if (container.querySelector(`[${INJECTED_ATTR}]`)) return
    const href = link.getAttribute('href')
    if (!href) return
    const wrap = buttonContainer()
    wrap.style.cssText += OVERLAY_WRAP_CSS
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative'
    }
    const getReleases = async () => {
      const release = await fetchReleaseTralbum(href)
      return release ? [release] : []
    }
    wrap.appendChild(
      cueButton({
        label: 'Play',
        variant: 'overlay',
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
        variant: 'overlay',
        onClick: async () => {
          const releases = await getReleases()
          if (releases.length === 0) return { ok: false, error: 'Could not load release' }
          return sendToWorker({ type: 'bandcamp:enqueue', releases })
        },
      }),
    )
    wrap.appendChild(
      renderCartButton({
        label: 'Fomo',
        variant: 'overlay',
        getReleases,
      }),
    )
    container.appendChild(wrap)
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

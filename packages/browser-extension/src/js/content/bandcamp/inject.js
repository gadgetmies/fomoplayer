// Injects Fomo Player buttons into bandcamp pages: per-track cue button +
// per-release "add to cart" dropdown on release pages, and a cart dropdown
// next to each item on discography listings.
import browser from '../../browser'
import { readTralbumData, releaseWithSingleTrack, fetchReleaseTralbum } from './scrape'
import { renderCartButton } from './cart-button'

// Marker attribute used to skip re-injection when the MutationObserver
// re-fires. Lowercase + hyphenated so it round-trips through `dataset` and
// CSS attribute selectors without case-folding collisions — the previous
// camelCase name silently broke the dedup check and caused an injection
// loop.
const INJECTED_ATTR = 'data-fp-injected'

const sendToWorker = (message) => browser.runtime.sendMessage(message).catch(() => null)

// Both album (`/album/...`) and single-track (`/track/...`) pages render a
// `#name-section` and expose `window.TralbumData`. Either signal is enough
// to treat the page as a release-level page.
const onReleasePage = () => Boolean(document.querySelector('#name-section'))
const onDiscographyPage = () =>
  Boolean(document.querySelector('.music-grid, #music-grid, .leftMiddleColumns .music-grid-item'))

const cueButton = ({ onClick, label = 'Queue' }) => {
  const host = document.createElement('span')
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML = `
    <style>
      :host { all: initial; display: inline-block; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
      button { background: transparent; color: #0687f5; border: 1px solid #0687f5; font-size: 11px; padding: 2px 8px; border-radius: 3px; cursor: pointer; line-height: 1.4; }
      button:hover { background: #0687f5; color: #fff; }
    </style>
    <button>${label}</button>
  `
  shadow.querySelector('button').addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    onClick()
  })
  return host
}

const buttonContainer = () => {
  const wrap = document.createElement('span')
  wrap.setAttribute(INJECTED_ATTR, '1')
  wrap.style.cssText = 'display: inline-flex; gap: 6px; margin-left: 8px; vertical-align: middle;'
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
        label: `Queue ${releaseLabel}`,
        onClick: () =>
          sendToWorker({
            type: 'bandcamp:enqueue',
            releases: [release],
          }),
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
        label: 'Queue',
        onClick: () => {
          const slim = releaseWithSingleTrack(release, trackId)
          if (slim) sendToWorker({ type: 'bandcamp:enqueue', releases: [slim] })
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
    trackTitleCell.appendChild(wrap)
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

const injectDiscographyButtons = () => {
  const items = document.querySelectorAll('#music-grid > li, .music-grid-item')
  items.forEach((item) => {
    if (item.querySelector(`[${INJECTED_ATTR}]`)) return
    const link = item.querySelector('a[href*="/album/"], a[href*="/track/"]')
    if (!link) return
    const href = link.getAttribute('href')
    const wrap = buttonContainer()
    wrap.style.cssText += 'position: absolute; top: 6px; right: 6px; z-index: 5;'
    if (getComputedStyle(item).position === 'static') {
      item.style.position = 'relative'
    }
    const getReleases = async () => {
      const release = await fetchReleaseTralbum(href)
      return release ? [release] : []
    }
    wrap.appendChild(
      cueButton({
        label: 'Queue',
        onClick: async () => {
          const releases = await getReleases()
          if (releases.length === 0) return
          sendToWorker({ type: 'bandcamp:enqueue', releases })
        },
      }),
    )
    wrap.appendChild(
      renderCartButton({
        label: 'Add to Fomo Player',
        getReleases,
      }),
    )
    item.appendChild(wrap)
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

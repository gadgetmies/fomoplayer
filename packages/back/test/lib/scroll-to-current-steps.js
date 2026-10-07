const { expect } = require('chai')
const { dismissOnboarding, waitForWithTimeoutMessage } = require('./setup')

// Shared browser interactions/assertions for the "Scroll to current" button
// demo. Both the local (demo-test) and preview (demo-preview) entry files import
// these verbatim; only the way tracks are seeded differs (and that is itself
// shared via seedTracks, which branches on PREVIEW_URL).

const TRACK_SELECTOR = '.tracks-table .track'
const TBODY_SELECTOR = '.tracks-table > tbody'
const PLAYING_SELECTOR = '.tracks-table .track.playing'
const SCROLL_TO_CURRENT_BUTTON = 'button:has-text("Scroll to current")'
// The button's horizontal centre must land within this many pixels of the
// track list's centre.
const CENTRE_TOLERANCE_PX = 2

const gotoTracksAndPlayFirst = async (page) => {
  // The remote preview can be cold or mid-restart when this runs, so wait
  // generously and reload once before giving up. Locally the rows appear
  // immediately, so this adds no real delay there.
  await page.goto('/tracks/recent')
  try {
    await page.waitForSelector(TRACK_SELECTOR, { timeout: 20000 })
  } catch {
    await page.goto('/tracks/recent')
    await waitForWithTimeoutMessage(
      () => page.waitForSelector(TRACK_SELECTOR, { timeout: 20000 }),
      'Load the tracks table with at least one seeded row before starting playback.',
    )
  }
  await dismissOnboarding(page)

  await page.locator(TRACK_SELECTOR).first().click()
  await waitForWithTimeoutMessage(
    () => page.waitForSelector(PLAYING_SELECTOR, { timeout: 10000 }),
    'Clicking the first track should mark it as the currently playing track.',
  )
}

// The track list only overflows (and so only shows the button) when it holds
// more rows than fit on screen. The seeded fixture set is small, so shrink the
// list's visible height to guarantee the playing row can be scrolled away.
const ensureTrackListScrolls = async (page) => {
  await page.evaluate((tbodySelector) => {
    const tbody = document.querySelector(tbodySelector)
    const rowHeight = tbody.querySelector('.track').getBoundingClientRect().height
    if (tbody.scrollHeight - tbody.clientHeight < rowHeight * 2) {
      tbody.style.flex = 'none'
      tbody.style.height = `${Math.floor(tbody.scrollHeight / 2)}px`
    }
  }, TBODY_SELECTOR)
}

const scrollPlayingTrackAboveScreen = async (page) => {
  await ensureTrackListScrolls(page)
  await page.hover(TBODY_SELECTOR)
  // Scroll in steps so the recording shows the playing row leaving the view.
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, 150)
  }
  await page.evaluate((tbodySelector) => {
    const tbody = document.querySelector(tbodySelector)
    tbody.scrollTo({ top: tbody.scrollHeight })
  }, TBODY_SELECTOR)
  await waitForWithTimeoutMessage(
    () => page.waitForSelector(SCROLL_TO_CURRENT_BUTTON, { state: 'visible', timeout: 10000 }),
    'Scrolling the playing track above the visible list should show the "Scroll to current" button.',
  )
}

const measureButton = (page) =>
  page.evaluate(
    ({ tbodySelector }) => {
      const button = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent.trim() === 'Scroll to current' && b.getBoundingClientRect().width > 0,
      )
      const tbody = document.querySelector(tbodySelector)
      const b = button.getBoundingClientRect()
      const t = tbody.getBoundingClientRect()
      return {
        buttonCentreX: (b.left + b.right) / 2,
        tbodyCentreX: (t.left + t.right) / 2,
        buttonTop: b.top,
        tbodyTop: t.top,
        tbodyBottom: t.bottom,
      }
    },
    { tbodySelector: TBODY_SELECTOR },
  )

const assertButtonCentredAtTop = async ({ page }) => {
  await scrollPlayingTrackAboveScreen(page)
  const m = await measureButton(page)
  expect(
    Math.abs(m.buttonCentreX - m.tbodyCentreX),
    `button centre x=${m.buttonCentreX} should match track list centre x=${m.tbodyCentreX}`,
  ).to.be.at.most(CENTRE_TOLERANCE_PX)
  // Pinned to the top edge of the track list, not floating elsewhere.
  expect(m.buttonTop).to.be.at.least(m.tbodyTop)
  expect(m.buttonTop - m.tbodyTop).to.be.below(20)
}

const assertButtonStaysPinnedWhileScrolling = async ({ page }) => {
  const before = await measureButton(page)
  await page.hover(TBODY_SELECTOR)
  await page.mouse.wheel(0, -60)
  await page.waitForTimeout(300)
  const after = await measureButton(page)
  expect(Math.abs(after.buttonTop - before.buttonTop)).to.be.at.most(1)
  expect(Math.abs(after.buttonCentreX - after.tbodyCentreX)).to.be.at.most(CENTRE_TOLERANCE_PX)
}

const assertClickingButtonScrollsBackToCurrent = async ({ page }) => {
  await page.click(SCROLL_TO_CURRENT_BUTTON)
  await waitForWithTimeoutMessage(
    () => page.waitForSelector(SCROLL_TO_CURRENT_BUTTON, { state: 'hidden', timeout: 10000 }),
    'Clicking "Scroll to current" should bring the playing track back into view and hide the button.',
  )
  const visible = await page.evaluate(
    ({ tbodySelector, playingSelector }) => {
      const t = document.querySelector(tbodySelector).getBoundingClientRect()
      const p = document.querySelector(playingSelector).getBoundingClientRect()
      return p.bottom > t.top && p.top < t.bottom
    },
    { tbodySelector: TBODY_SELECTOR, playingSelector: PLAYING_SELECTOR },
  )
  expect(visible).to.equal(true)
}

module.exports = {
  gotoTracksAndPlayFirst,
  assertButtonCentredAtTop,
  assertButtonStaysPinnedWhileScrolling,
  assertClickingButtonScrollsBackToCurrent,
}

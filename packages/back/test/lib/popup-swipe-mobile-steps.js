const { expect } = require('chai')
const { waitForWithTimeoutMessage } = require('./setup')
const { TRACK_SELECTOR, CART_POPUP_SELECTOR, gotoTracksAndOpenCartPopup } = require('./cart-popup-mobile-steps')

// Shared browser interactions/assertions for the "a swipe on an open popup does not swipe the track row" demo.
// Both the local (demo-test) and preview (demo-preview) entry files import these verbatim; only the way tracks are
// seeded differs (and that is itself shared via seedTracks, which branches on PREVIEW_URL).
//
// On a phone each track row slides sideways under the finger and, past a threshold, marks the track heard (or decides
// a cart review). The row's popups — the cart popup here — are rendered inside the row, so a sideways drag on an open
// popup or on the dark overlay behind it used to reach the row and trigger that swipe action.

// The dark backdrop that belongs to the open popup (the overlay is the popup container's next sibling).
const OPEN_POPUP_OVERLAY_SELECTOR = '.popup--open + .popup_overlay'

// Far enough right to pass the row's mark-heard threshold if the row saw the gesture.
const SWIPE_OFFSETS = [24, 48, 72, 104, 124, 138]

// POST /api/me/tracks/:id (numeric id) is the heard toggle; exclude sibling paths like /api/me/tracks/heard-lookup.
const isHeardPost = (request) =>
  request.method() === 'POST' && /\/api\/me\/tracks\/\d+$/.test(new URL(request.url()).pathname)

// Dispatch a synthetic touch on the element matched by `selector`, like a finger on the screen would: the event
// targets that element and bubbles up through its ancestors (the track row among them).
const dispatchTouch = (page, selector, type, clientX, clientY) =>
  page.evaluate(
    ({ selector, type, clientX, clientY }) => {
      const target = document.querySelector(selector)
      if (!target) throw new Error(`touch target ${selector} not found`)
      const touch = new Touch({ identifier: 1, target, clientX, clientY, pageX: clientX, pageY: clientY })
      const list = type === 'touchend' ? [] : [touch]
      target.dispatchEvent(
        new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          touches: list,
          targetTouches: list,
          changedTouches: [touch],
        }),
      )
    },
    { selector, type, clientX, clientY },
  )

const firstRowOffset = (page) =>
  page.evaluate((selector) => {
    const row = document.querySelector(selector)
    if (!row) throw new Error('track row not found')
    return row.style.transform || ''
  }, TRACK_SELECTOR)

// Swipe right across the element matched by `selector`, starting near its left edge at `startYFraction` of its
// height. Returns what the first track row did meanwhile: the largest slide it showed and whether a heard toggle was
// sent.
const swipeAcross = async (page, selector, { startYFraction = 0.5 } = {}) => {
  const heardPosts = []
  const onRequest = (request) => isHeardPost(request) && heardPosts.push(request)
  page.on('request', onRequest)
  try {
    const box = await page.evaluate((selector) => {
      const { left, top, width, height } = document.querySelector(selector).getBoundingClientRect()
      return { left, top, width, height }
    }, selector)
    const startX = Math.floor(box.left + 16)
    const y = Math.floor(box.top + box.height * startYFraction)

    const rowTransforms = []
    await dispatchTouch(page, selector, 'touchstart', startX, y)
    for (const offset of SWIPE_OFFSETS) {
      await dispatchTouch(page, selector, 'touchmove', startX + offset, y)
      await page.waitForTimeout(120)
      rowTransforms.push(await firstRowOffset(page))
    }
    await dispatchTouch(page, selector, 'touchend', startX + SWIPE_OFFSETS[SWIPE_OFFSETS.length - 1], y)
    // Give a heard toggle (if any) time to leave the browser before reading the requests.
    await page.waitForTimeout(500)
    return { rowTransforms, heardPosts }
  } finally {
    page.off('request', onRequest)
  }
}

const expectRowUntouched = ({ rowTransforms, heardPosts }, where) => {
  const slid = rowTransforms.filter((transform) => transform.includes('translateX('))
  expect(slid, `the track row should not slide while swiping on ${where}`).to.deep.equal([])
  expect(heardPosts.length, `a swipe on ${where} should not mark the track heard or unheard`).to.equal(0)
}

const expectCartPopupOpen = async (page, message) => {
  const open = await page.isVisible(CART_POPUP_SELECTOR)
  expect(open, message).to.equal(true)
}

const swipeOnPopupLeavesRowInPlace = async ({ page }) => {
  // Start the swipe on the popup's search box area (near its top), where a user would naturally put a finger.
  const result = await swipeAcross(page, CART_POPUP_SELECTOR, { startYFraction: 0.15 })
  expectRowUntouched(result, 'the open cart popup')
  await expectCartPopupOpen(page, 'the cart popup should stay open after a swipe on it')
}

const swipeOnOverlayLeavesRowInPlace = async ({ page }) => {
  // The overlay spans the whole screen; swipe across its upper part, above the popup.
  const result = await swipeAcross(page, OPEN_POPUP_OVERLAY_SELECTOR, { startYFraction: 0.2 })
  expectRowUntouched(result, 'the dark overlay behind the cart popup')
  await expectCartPopupOpen(page, 'the cart popup should stay open after a swipe on its overlay')
}

// With the popup closed the row still follows a sideways swipe; releasing it short of the threshold slides it back
// without changing anything, so this leaves the track's heard state as it was.
const rowStillSwipesWithPopupClosed = async ({ page }) => {
  await page.click(OPEN_POPUP_OVERLAY_SELECTOR, { position: { x: 40, y: 40 } })
  await waitForWithTimeoutMessage(
    () => page.waitForSelector(CART_POPUP_SELECTOR, { state: 'hidden', timeout: 5000 }),
    'Tapping the dark overlay should close the cart popup.',
  )

  const box = await page.evaluate((selector) => {
    const { left, top, height } = document.querySelector(selector).getBoundingClientRect()
    return { left, top, height }
  }, TRACK_SELECTOR)
  const startX = Math.floor(box.left + 16)
  const y = Math.floor(box.top + box.height / 2)
  await dispatchTouch(page, TRACK_SELECTOR, 'touchstart', startX, y)
  for (const offset of [24, 48, 72]) {
    await dispatchTouch(page, TRACK_SELECTOR, 'touchmove', startX + offset, y)
    await page.waitForTimeout(150)
  }
  expect(await firstRowOffset(page), 'the track row should follow a swipe on the row itself').to.include(
    'translateX(',
  )
  await dispatchTouch(page, TRACK_SELECTOR, 'touchend', startX + 72, y)
  await waitForWithTimeoutMessage(
    () =>
      page.waitForFunction(
        (selector) => !(document.querySelector(selector)?.style.transform || '').includes('translateX('),
        TRACK_SELECTOR,
        { timeout: 3000 },
      ),
    'Released short of the threshold, the row should slide back.',
  )
}

const cases = {
  'a sideways swipe on the open cart popup does not swipe the track row': swipeOnPopupLeavesRowInPlace,
  'a sideways swipe on the dark overlay behind the popup does not swipe the track row': swipeOnOverlayLeavesRowInPlace,
  'with the popup closed the track row still follows a swipe': rowStillSwipesWithPopupClosed,
}

module.exports = { gotoTracksAndOpenCartPopup, cases }

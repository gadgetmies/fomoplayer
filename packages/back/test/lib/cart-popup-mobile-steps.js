const { expect } = require('chai')
const { dismissOnboarding, waitForWithTimeoutMessage } = require('./setup')

// Shared browser interactions/assertions for the mobile add-to-cart popup demo.
// Both the local (demo-test) and preview (demo-preview) entry files import these
// verbatim; only the way tracks are seeded differs (and that is itself shared
// via seedTracks, which branches on PREVIEW_URL).

const TRACK_SELECTOR = '.tracks-table .track'
// The add-to-cart control in a track row is the only split DropDownButton there:
// its left half adds to the default cart, its right half (the caret) opens the
// popup we are exercising.
const CART_CARET_SELECTOR = `${TRACK_SELECTOR} .table-cell-button-row .button-drop_down-right`
// The popup content only exists in the DOM while the popup is open (on mobile it
// is click-, not hover-driven), so this selector doubles as an "is open" check.
const CART_POPUP_SELECTOR = '.cart-popup.popup_content'

const gotoTracksAndOpenCartPopup = async (page) => {
  // The remote preview is shared and redeploys on every push, so it can be cold
  // or mid-restart when this runs — the seeded tracks then take longer than a
  // warm backend to render. Wait generously and reload once before giving up.
  // Locally the rows appear immediately, so this adds no real delay there.
  await page.goto('/tracks/recent')
  try {
    await page.waitForSelector(TRACK_SELECTOR, { timeout: 20000 })
  } catch {
    await page.goto('/tracks/recent')
    await waitForWithTimeoutMessage(
      () => page.waitForSelector(TRACK_SELECTOR, { timeout: 20000 }),
      'Load the tracks table with at least one seeded row before opening the cart popup.',
    )
  }
  await dismissOnboarding(page)

  await waitForWithTimeoutMessage(
    () => page.waitForSelector(CART_CARET_SELECTOR, { state: 'visible', timeout: 10000 }),
    'The first track row should expose an add-to-cart dropdown caret on mobile.',
  )
  // Tap the caret on the first track row to open the add-to-cart popup.
  await page.click(CART_CARET_SELECTOR)

  await waitForWithTimeoutMessage(
    () => page.waitForSelector(CART_POPUP_SELECTOR, { state: 'visible', timeout: 10000 }),
    'Tapping the cart caret should open the add-to-cart popup.',
  )
}

// The regression this guards against: after the swipe-to-mark-heard change each
// track <tr> became `position: relative`, which trapped the `position: absolute`
// popup at the bottom of its row and confined the dark overlay to that row, so
// the popup slipped behind the player. The popup must instead be pinned to the
// bottom-middle of the viewport, on top of everything, with a full-screen
// backdrop behind it.
const assertCartPopupAnchoredBottomAndOnTop = async ({ page }) => {
  const metrics = await page.evaluate((popupSelector) => {
    const content = document.querySelector(popupSelector)
    if (!content) throw new Error('cart popup content not found')
    const container = content.closest('.popup_container')
    const overlay = container && container.nextElementSibling
    if (!overlay || !overlay.classList.contains('popup_overlay')) {
      throw new Error('cart popup overlay not found next to the open popup container')
    }

    const vw = window.innerWidth
    const vh = window.innerHeight
    const c = content.getBoundingClientRect()
    const o = overlay.getBoundingClientRect()
    const contentStyle = getComputedStyle(content)
    const overlayStyle = getComputedStyle(overlay)

    // A point near the top of the screen, over the player/table the popup used
    // to hide behind. With the fix the full-screen overlay covers it on top.
    const topEl = document.elementFromPoint(Math.round(vw / 2), 24)
    const overlayOnTopAtTop = topEl === overlay || overlay.contains(topEl)

    // The centre of the popup should hit the popup (or its content), not
    // anything painted above it.
    const cx = Math.round((c.left + c.right) / 2)
    const cy = Math.round((c.top + c.bottom) / 2)
    const centreEl = document.elementFromPoint(cx, cy)
    const popupOnTopAtCentre = centreEl === content || content.contains(centreEl)

    return {
      vw,
      vh,
      content: { left: c.left, right: c.right, bottom: c.bottom },
      overlay: { left: o.left, top: o.top, width: o.width, height: o.height },
      contentPosition: contentStyle.position,
      overlayPosition: overlayStyle.position,
      overlayDisplay: overlayStyle.display,
      overlayOnTopAtTop,
      popupOnTopAtCentre,
    }
  }, CART_POPUP_SELECTOR)

  // Anchored to the viewport (not the track row) via position: fixed …
  expect(metrics.contentPosition, 'popup should be position: fixed').to.equal('fixed')
  expect(metrics.overlayPosition, 'overlay should be position: fixed').to.equal('fixed')

  // … pinned to the bottom of the screen …
  expect(metrics.content.bottom, 'popup should sit at the bottom of the viewport').to.be.closeTo(metrics.vh, 2)

  // … and horizontally centred (equal gutters either side).
  const leftGutter = metrics.content.left
  const rightGutter = metrics.vw - metrics.content.right
  expect(leftGutter, 'popup should have a left gutter').to.be.greaterThan(0)
  expect(Math.abs(leftGutter - rightGutter), 'popup should be horizontally centred').to.be.lessThan(4)

  // The dark backdrop covers the whole viewport (previously only the row).
  expect(metrics.overlay.left, 'overlay should start at the left edge').to.be.closeTo(0, 1)
  expect(metrics.overlay.top, 'overlay should start at the top edge').to.be.closeTo(0, 1)
  expect(metrics.overlay.width, 'overlay should span the viewport width').to.be.closeTo(metrics.vw, 2)
  expect(metrics.overlay.height, 'overlay should span the viewport height').to.be.closeTo(metrics.vh, 2)
  expect(metrics.overlayDisplay, 'overlay should be visible').to.not.equal('none')

  // The popup and overlay render above the player bar / table content.
  expect(metrics.overlayOnTopAtTop, 'overlay should cover the area above the table').to.equal(true)
  expect(metrics.popupOnTopAtCentre, 'popup should render on top at its centre').to.equal(true)
}

module.exports = {
  TRACK_SELECTOR,
  CART_POPUP_SELECTOR,
  gotoTracksAndOpenCartPopup,
  assertCartPopupAnchoredBottomAndOnTop,
}

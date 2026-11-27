const { expect } = require('chai')
const { dismissOnboarding, waitForWithTimeoutMessage } = require('./setup')

// Shared browser interactions/assertions for the "the cart popup stays open while adding to / removing from a cart"
// demo. Both the local (demo-test) and preview (demo-preview) entry files import these verbatim; only the way tracks
// are seeded differs (and that is itself shared via seedTracks, which branches on PREVIEW_URL).
//
// The flow toggles one cart twice (add, then remove, or the other way round on a preview that already has the track
// in that cart), so a run leaves the cart as it found it and the test is safe to re-run on the shared preview.

const TRACK_SELECTOR = '.tracks-table .track'
const FIRST_ROW = `${TRACK_SELECTOR} >> nth=0`
// The add-to-cart control in a track row is the only split drop-down button there: its left half adds to the default
// cart, its right half (the caret) opens the cart popup.
const CART_CARET = '.table-cell-button-row .button-drop_down-right'
const CART_MAIN_BUTTON = '.table-cell-button-row .button-drop_down-left'
const CART_POPUP = '.cart-popup.popup_content'
const CART_BUTTON = '.cart-button'

// Matched on the path only: the front end appends store= query parameters to every API call.
const isCartTracksUrl = (url) => /\/api\/me\/carts\/[^/]+\/tracks$/.test(url.pathname)
const isCartPatch = (request) => request.method() === 'PATCH' && isCartTracksUrl(new URL(request.url()))

const gotoTracks = async (page) => {
  // The remote preview is shared and redeploys on every push, so it can be cold or mid-restart when this runs; wait
  // generously and reload once before giving up. Locally the rows appear immediately.
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
}

// Opens the first track row's cart popup: on a desktop it opens while the pointer is over the caret (and stays open
// while the pointer is over the popup), on a phone a tap on the caret opens it.
const openCartPopup = async (page, { phone }) => {
  const row = page.locator(FIRST_ROW)
  const caret = row.locator(CART_CARET)
  await waitForWithTimeoutMessage(
    () => caret.waitFor({ state: 'visible', timeout: 10000 }),
    'The first track row should show the add-to-cart drop-down caret.',
  )
  if (phone) await caret.click()
  else await caret.hover()
  await waitForWithTimeoutMessage(
    () => row.locator(CART_POPUP).waitFor({ state: 'visible', timeout: 10000 }),
    `${phone ? 'Tapping' : 'Pointing at'} the cart caret should open the cart popup.`,
  )
  await waitForWithTimeoutMessage(
    () => row.locator(`${CART_POPUP} ${CART_BUTTON}`).first().waitFor({ state: 'visible', timeout: 10000 }),
    'The cart popup should list the carts.',
  )
}

const cartButtonIcon = (button) => button.locator('svg').first().getAttribute('data-icon')

// Holds the cart request in the browser until `release` is called, so the "request running" state can be seen and
// checked instead of flashing by. `stop` releases any held request and waits for its response before removing the
// route: `route.fallback()` hands the request to the next route handler (the test harness's /api/ forwarding) only
// after this handler returns, and removing the route before that handler has continued the request makes it fail
// with "Route is already handled", which ends the whole test file. (Waiting for the response inside this handler
// would deadlock for the same reason.)
const holdCartRequests = async (page) => {
  let release
  const released = new Promise((resolve) => (release = resolve))
  const heldRequests = []
  const handler = async (route) => {
    if (route.request().method() === 'PATCH') {
      heldRequests.push(route.request())
      await released
    }
    await route.fallback()
  }
  await page.route(isCartTracksUrl, handler)
  return {
    release: () => release(),
    stop: async () => {
      release()
      await Promise.all(heldRequests.map((request) => request.response().catch(() => null)))
      await page.unroute(isCartTracksUrl, handler)
    },
  }
}

// Clicks one cart in the popup and checks the popup stays open while the request runs (only its buttons disabled,
// the main cart button showing its spinner) and after it finishes (the cart's icon flipped, buttons usable again).
const toggleCartKeepingPopupOpen = async (page, cartName) => {
  const row = page.locator(FIRST_ROW)
  const popup = row.locator(CART_POPUP)
  const button = popup.locator(CART_BUTTON, { hasText: cartName })
  const iconBefore = await cartButtonIcon(button)
  const expectedIcon = iconBefore === 'plus' ? 'minus' : 'plus'

  const hold = await holdCartRequests(page)
  try {
    const patchSent = page.waitForRequest(isCartPatch, { timeout: 10000 })
    await button.click()
    await waitForWithTimeoutMessage(() => patchSent, `Clicking the "${cartName}" cart should send the cart update.`)

    expect(await popup.isVisible(), 'the cart popup should stay open while the cart update runs').to.equal(true)
    await waitForWithTimeoutMessage(
      () =>
        page.waitForFunction(
          ({ rowSelector, popupSelector, buttonSelector }) => {
            const row = document.querySelector(rowSelector)
            const buttons = Array.from(row?.querySelectorAll(`${popupSelector} ${buttonSelector}`) || [])
            return buttons.length > 0 && buttons.every((b) => b.disabled)
          },
          { rowSelector: TRACK_SELECTOR, popupSelector: CART_POPUP, buttonSelector: CART_BUTTON },
          { timeout: 5000 },
        ),
      'While the cart update runs, the cart buttons in the popup should be disabled.',
    )
    expect(
      await row.locator(`${CART_MAIN_BUTTON} .loading-indicator`).count(),
      'the main cart button should show its spinner while the cart update runs',
    ).to.equal(1)

    const responded = page.waitForResponse((response) => isCartPatch(response.request()), { timeout: 10000 })
    hold.release()
    await waitForWithTimeoutMessage(() => responded, 'The held cart update should complete once released.')
  } finally {
    await hold.stop()
  }

  await waitForWithTimeoutMessage(
    () =>
      page.waitForFunction(
        ({ rowSelector, popupSelector, buttonSelector, cartName, expectedIcon }) => {
          const row = document.querySelector(rowSelector)
          const buttons = Array.from(row?.querySelectorAll(`${popupSelector} ${buttonSelector}`) || [])
          const button = buttons.find((b) => b.textContent.trim() === cartName)
          return (
            button &&
            buttons.every((b) => !b.disabled) &&
            button.querySelector('svg')?.getAttribute('data-icon') === expectedIcon
          )
        },
        { rowSelector: TRACK_SELECTOR, popupSelector: CART_POPUP, buttonSelector: CART_BUTTON, cartName, expectedIcon },
        { timeout: 10000 },
      ),
    `After the update the "${cartName}" cart should show "${expectedIcon}" and the cart buttons be usable again.`,
  )
  expect(await popup.isVisible(), 'the cart popup should still be open after the cart update').to.equal(true)
}

const addAndRemoveKeepingPopupOpen = async (page, { phone }) => {
  await gotoTracks(page)
  await openCartPopup(page, { phone })
  const firstCart = page.locator(FIRST_ROW).locator(`${CART_POPUP} ${CART_BUTTON}`).first()
  const cartName = (await firstCart.textContent()).trim()
  // Toggle the same cart twice: in and out again (or out and in), without reopening the popup in between.
  await toggleCartKeepingPopupOpen(page, cartName)
  await toggleCartKeepingPopupOpen(page, cartName)
}

const cases = {
  'on a desktop the cart popup stays open while a track is added to and removed from a cart': async ({ page }) =>
    addAndRemoveKeepingPopupOpen(page, { phone: false }),
  'on a phone the cart popup stays open while a track is added to and removed from a cart': async ({ phonePage }) =>
    addAndRemoveKeepingPopupOpen(phonePage, { phone: true }),
}

module.exports = { cases }

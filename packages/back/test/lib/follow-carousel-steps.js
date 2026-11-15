// Shared browser steps and assertions for the follow-carousel demo tests.
//
// On the Settings "Following" tab the artist/label cards of the follow search
// results and of the purchase-based follow suggestions sit in a single-row,
// horizontally scrollable carousel. These steps run on a touch-enabled mobile
// context and check, with real (browser-synthesised) touch gestures, that
//   - the cards are laid out in one row,
//   - a horizontal swipe scrolls the carousel, and
//   - a vertical swipe that starts on a carousel scrolls the page, not the
//     carousel — the carousel must not trap vertical scrolling.
//
// Imported verbatim by both the -local and -preview entry files.

const { expect } = require('chai')
const { waitForWithTimeoutMessage, dismissOnboarding } = require('./setup')

const SUGGESTIONS_CAROUSEL = '[data-test="follow-suggestions-carousel"]'
const RESULTS_CAROUSEL = '[data-test="follow-results-carousel"]'

const gotoFollowing = async (page) => {
  await page.goto('/settings/following')
  await waitForWithTimeoutMessage(
    () => page.waitForSelector('.settings-container', { timeout: 15000 }),
    'Render the settings container before checking the follow carousels.',
  )
  await dismissOnboarding(page)
  await waitForWithTimeoutMessage(
    () => page.waitForSelector(SUGGESTIONS_CAROUSEL, { timeout: 15000 }),
    'Render the follow-suggestions carousel seeded from the purchased cart.',
  )
}

// Sum of the vertical scroll offsets of the document and every scrollable
// ancestor of the element, so the check does not depend on which element ends
// up being the page's scroll container.
const pageScrollTop = (page, selector) =>
  page.evaluate((selector) => {
    let total = window.scrollY
    for (let el = document.querySelector(selector).parentElement; el; el = el.parentElement) {
      total += el.scrollTop
    }
    return total
  }, selector)

const carouselMetrics = (page, selector) =>
  page.evaluate((selector) => {
    const el = document.querySelector(selector)
    const rect = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    const itemTops = [...el.children].map((li) => Math.round(li.getBoundingClientRect().top))
    return {
      itemCount: el.children.length,
      rowCount: new Set(itemTops).size,
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      scrollLeft: el.scrollLeft,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      centreX: Math.round(rect.left + rect.width / 2),
      centreY: Math.round(rect.top + rect.height / 2),
    }
  }, selector)

// A real finger drag dispatched through the DevTools protocol (not a JS
// TouchEvent), so Chromium's native touch scrolling and scroll chaining behave
// exactly as on a phone. The distances are how far the finger moves: a
// negative xDistance drags left (scrolls content right), a negative yDistance
// drags up (scrolls the page down).
const swipe = async (page, { x, y, xDistance = 0, yDistance = 0 }) => {
  const cdp = await page.context().newCDPSession(page)
  const steps = 12
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x + (xDistance * i) / steps, y: y + (yDistance * i) / steps }],
      })
      await page.waitForTimeout(16)
    }
    // Hold still before lifting the finger so the drag ends without a fling.
    await page.waitForTimeout(150)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } finally {
    await cdp.detach()
  }
  // Let the scroll and the demo recording settle.
  await page.waitForTimeout(400)
}

const assertCarousel = async (page, selector, label) => {
  // Centre the carousel on screen so the page can scroll in both directions.
  // On the suggestions section this picks the artists row, the first of two.
  await page.evaluate((selector) => document.querySelector(selector).scrollIntoView({ block: 'center' }), selector)
  await page.waitForTimeout(300)

  const before = await carouselMetrics(page, selector)
  expect(before.itemCount, `${label}: has cards`).to.be.greaterThan(0)
  expect(before.rowCount, `${label}: cards are laid out in a single row`).to.equal(1)
  expect(before.overflowX, `${label}: scrolls horizontally`).to.equal('auto')
  expect(before.overflowY, `${label}: never scrolls vertically`).to.equal('hidden')
  expect(before.scrollHeight, `${label}: has no vertical overflow`).to.be.at.most(before.clientHeight + 1)

  if (before.scrollWidth > before.clientWidth) {
    // A horizontal swipe scrolls the carousel sideways.
    await swipe(page, { x: before.centreX, y: before.centreY, xDistance: -150 })
    const afterHorizontal = await carouselMetrics(page, selector)
    expect(afterHorizontal.scrollLeft, `${label}: horizontal swipe scrolls the carousel`).to.be.greaterThan(
      before.scrollLeft,
    )
  }

  // A vertical swipe that starts on the carousel scrolls the page instead.
  const start = await carouselMetrics(page, selector)
  const pageTopBefore = await pageScrollTop(page, selector)
  await swipe(page, { x: start.centreX, y: start.centreY, yDistance: -150 })
  const pageTopAfter = await pageScrollTop(page, selector)
  const end = await carouselMetrics(page, selector)
  expect(pageTopAfter, `${label}: vertical swipe over the carousel scrolls the page`).to.be.greaterThan(
    pageTopBefore + 50,
  )
  expect(end.scrollLeft, `${label}: vertical swipe leaves the carousel's horizontal position alone`).to.equal(
    start.scrollLeft,
  )

  // Likewise a vertical mouse wheel over the carousel scrolls the page.
  await page.evaluate((selector) => document.querySelector(selector).scrollIntoView({ block: 'center' }), selector)
  const wheelStart = await carouselMetrics(page, selector)
  const wheelTopBefore = await pageScrollTop(page, selector)
  await page.mouse.move(wheelStart.centreX, wheelStart.centreY)
  await page.mouse.wheel(0, 200)
  await page.waitForTimeout(400)
  expect(
    await pageScrollTop(page, selector),
    `${label}: mouse wheel over the carousel scrolls the page`,
  ).to.be.greaterThan(wheelTopBefore + 50)
}

const assertSuggestionsCarousel = async ({ page }) => {
  await assertCarousel(page, SUGGESTIONS_CAROUSEL, 'follow suggestions')
}

// Searching by name fills the results carousel. The search goes to the stores
// (mocked in CI), so only assert the layout once results have rendered.
const assertSearchResultsCarousel = async ({ page }) => {
  await page.evaluate(() => window.scrollTo(0, 0))
  const input = page.locator('[data-onboarding-id="follow-search"] input')
  await input.click()
  await input.fill('noisia')
  await waitForWithTimeoutMessage(
    () => page.waitForSelector(`${RESULTS_CAROUSEL} li`, { timeout: 20000 }),
    'Render follow search results for "noisia" in the results carousel.',
  )
  await assertCarousel(page, RESULTS_CAROUSEL, 'follow search results')
}

module.exports = { gotoFollowing, assertSuggestionsCarousel, assertSearchResultsCarousel }

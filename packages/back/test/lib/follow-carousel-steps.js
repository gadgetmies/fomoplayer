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
// On a desktop context (a fine, hovering pointer) they check the mouse
// controls: previous/next arrow buttons, the edge fade that marks the side with
// more cards, and Shift + wheel scrolling the row sideways while a plain wheel
// keeps scrolling the page.
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
  // Touch devices swipe: the mouse arrow buttons stay hidden.
  const arrows = page.locator('.follow-carousel-arrow')
  for (let i = 0; i < (await arrows.count()); i++) {
    expect(await arrows.nth(i).isVisible(), 'arrow buttons are hidden on touch devices').to.equal(false)
  }
}

const carouselState = (page, selector) =>
  page.evaluate((selector) => {
    const list = document.querySelector(selector)
    const wrapper = list.closest('.follow-carousel')
    return {
      scrollLeft: list.scrollLeft,
      maxScrollLeft: list.scrollWidth - list.clientWidth,
      canScrollLeft: wrapper.dataset.canScrollLeft === 'true',
      canScrollRight: wrapper.dataset.canScrollRight === 'true',
      maskImage: getComputedStyle(list).maskImage || getComputedStyle(list).webkitMaskImage,
    }
  }, selector)

// Narrow enough that the four seeded artist suggestions overflow the row.
const NARROW_DESKTOP_VIEWPORT = { width: 480, height: 720 }

// Mouse controls on a desktop context: arrows, edge fade and Shift + wheel.
const assertMouseControls = async ({ desktopPage: page }) => {
  const originalViewport = page.viewportSize()
  await page.setViewportSize(NARROW_DESKTOP_VIEWPORT)
  try {
    await gotoFollowing(page)
    const carousel = page.locator(SUGGESTIONS_CAROUSEL).first()
    const wrapper = page.locator('.follow-carousel', { has: carousel }).first()
    await carousel.scrollIntoViewIfNeeded()
    const previous = wrapper.locator('[data-test="follow-carousel-previous"]')
    const next = wrapper.locator('[data-test="follow-carousel-next"]')

    // At the start: only the right edge fades, "previous" is disabled.
    await waitForWithTimeoutMessage(
      () => next.waitFor({ state: 'visible', timeout: 10000 }),
      'Show the carousel arrow buttons for a mouse pointer when the row overflows.',
    )
    let state = await carouselState(page, SUGGESTIONS_CAROUSEL)
    expect(state.maxScrollLeft, 'the row overflows at this width').to.be.greaterThan(0)
    expect(state.canScrollLeft, 'starts scrolled to the left').to.equal(false)
    expect(state.canScrollRight, 'more cards to the right').to.equal(true)
    expect(state.maskImage, 'the right edge fades').to.include('gradient')
    expect(await previous.isDisabled(), '"previous" is disabled at the start').to.equal(true)
    expect(await next.isEnabled(), '"next" is enabled at the start').to.equal(true)

    // "Next" scrolls the row right and enables "previous".
    await next.click()
    await page.waitForFunction((selector) => document.querySelector(selector).scrollLeft > 0, SUGGESTIONS_CAROUSEL, {
      timeout: 5000,
    })
    await page.waitForTimeout(600)
    state = await carouselState(page, SUGGESTIONS_CAROUSEL)
    expect(state.canScrollLeft, '"next" scrolled the row right').to.equal(true)
    expect(await previous.isEnabled(), '"previous" is enabled once scrolled').to.equal(true)

    // "Previous" scrolls back to the start.
    await previous.click()
    await page.waitForFunction((selector) => document.querySelector(selector).scrollLeft <= 1, SUGGESTIONS_CAROUSEL, {
      timeout: 5000,
    })
    await page.waitForTimeout(600)
    expect(await previous.isDisabled(), '"previous" is disabled again at the start').to.equal(true)

    // Shift + wheel over the row scrolls it sideways and leaves the page alone.
    const box = await carousel.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    const pageTopBefore = await pageScrollTop(page, SUGGESTIONS_CAROUSEL)
    await page.keyboard.down('Shift')
    try {
      await page.mouse.wheel(0, 120)
    } finally {
      await page.keyboard.up('Shift')
    }
    await page.waitForTimeout(400)
    state = await carouselState(page, SUGGESTIONS_CAROUSEL)
    expect(state.scrollLeft, 'Shift + wheel scrolls the row sideways').to.be.greaterThan(0)
    expect(await pageScrollTop(page, SUGGESTIONS_CAROUSEL), 'Shift + wheel does not scroll the page').to.equal(
      pageTopBefore,
    )

    // A plain wheel over the row still scrolls the page, not the row.
    const rowLeftBefore = state.scrollLeft
    await page.mouse.wheel(0, 200)
    await page.waitForTimeout(400)
    expect(
      await pageScrollTop(page, SUGGESTIONS_CAROUSEL),
      'a plain wheel over the row scrolls the page',
    ).to.be.greaterThan(pageTopBefore + 50)
    expect((await carouselState(page, SUGGESTIONS_CAROUSEL)).scrollLeft, 'a plain wheel leaves the row').to.equal(
      rowLeftBefore,
    )
  } finally {
    if (originalViewport) await page.setViewportSize(originalViewport)
  }
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

module.exports = { gotoFollowing, assertSuggestionsCarousel, assertSearchResultsCarousel, assertMouseControls }

// The cart list renders only the rows near the view, with spacer rows standing in for the rest. Scrolling must move
// the rows on screen by exactly the scrolled distance: a spacer that is off by even a few pixels makes the rows jump
// whenever rows move into or out of the spacers. The cart is long enough to page only with synthetic rows, so its
// pages are answered in the browser from a copy of a real row.
const { expect } = require('chai')
const { test } = require('cascade-test')
const { getSharedContext, teardownSharedContext, waitForWithTimeoutMessage } = require('../lib/setup')
const { seedTracks } = require('../lib/seed')
const { resolveTestUserId } = require('../lib/test-user')
const { addFirstRecentTrackToDefaultCart } = require('../lib/cart-remove-keeps-row-steps')

const TRACK_COUNT = 150
const SCROLL_STEP_PX = 45
const CART_PAGE_REQUEST = /\/carts\/[0-9a-f-]+\?offset=(\d+)&limit=(\d+)/

const answerCartPagesWithSyntheticRows = async (page) => {
  await page.route(CART_PAGE_REQUEST, async (route) => {
    const url = new URL(route.request().url())
    const offset = Number(url.searchParams.get('offset'))
    const limit = Number(url.searchParams.get('limit'))
    url.searchParams.set('offset', '0')
    const real = await (await route.fetch({ url: url.toString() })).json()
    const template = real.tracks[0]
    const tracks = Array.from({ length: TRACK_COUNT }, (_, i) => ({
      ...template,
      id: 900000000 + i,
      title: `Scroll stability ${i}`,
    })).slice(offset, offset + limit)
    await route.fulfill({
      json: {
        ...real,
        cart: { ...real.cart, trackCount: TRACK_COUNT },
        tracks,
        page: { ...real.page, offset, limit, total: TRACK_COUNT },
      },
    })
  })
}

// Scrolls the list in small steps and returns, per step, how far a row in the middle of the view moved compared to
// how far the list scrolled.
const scrollAndMeasure = (page, steps) =>
  page.evaluate(
    async ({ steps, step }) => {
      const tbody = document.querySelector('.tracks-table > tbody')
      const settle = () => new Promise((resolve) => setTimeout(() => requestAnimationFrame(() => resolve()), 80))
      const rowInMiddle = () => {
        const middle = tbody.getBoundingClientRect().top + tbody.clientHeight / 2
        // The first row reaching below the middle: the middle can fall in the margin between two rows
        return Array.from(tbody.querySelectorAll('tr.track[data-track-id]')).find(
          (row) => row.getBoundingClientRect().bottom >= middle,
        )
      }
      const results = []
      await settle()
      const waitForNextPage = async () => {
        const deadline = Date.now() + 5000
        while (tbody.scrollHeight - tbody.clientHeight - tbody.scrollTop < step && Date.now() < deadline) {
          await settle()
        }
      }
      for (let i = 0; i < steps; i++) {
        await waitForNextPage()
        const anchor = rowInMiddle()
        if (!anchor) throw new Error(`No row in the middle of the view at scrollTop ${tbody.scrollTop}`)
        const id = anchor.dataset.trackId
        const topBefore = anchor.getBoundingClientRect().top
        const scrollBefore = tbody.scrollTop
        tbody.scrollTop = scrollBefore + step
        await settle()
        const after = tbody.querySelector(`tr.track[data-track-id="${id}"]`)
        if (!after) throw new Error(`Row ${id} was not rendered after scrolling to ${tbody.scrollTop}`)
        results.push({
          id,
          scrolled: tbody.scrollTop - scrollBefore,
          moved: topBefore - after.getBoundingClientRect().top,
        })
      }
      return {
        results,
        renderedIds: Array.from(tbody.querySelectorAll('tr.track[data-track-id]')).map((row) => row.dataset.trackId),
        scrollTop: tbody.scrollTop,
      }
    },
    { steps, step: SCROLL_STEP_PX },
  )

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getSharedContext()
    const userId = await resolveTestUserId()
    await seedTracks({ userIds: [userId] })
    await addFirstRecentTrackToDefaultCart(page)
    await answerCartPagesWithSyntheticRows(page)
    const cartsButton = page.locator('.menu_left a, .menu_left button').filter({ hasText: 'Carts' }).first()
    await cartsButton.click({ timeout: 10000 })
    await page.waitForURL(/\/carts\/[^/]+/, { timeout: 10000 })
    // The carts view shows the cart already in memory: reload it so its pages are fetched (and answered) afresh
    await page.reload()
    await waitForWithTimeoutMessage(
      () => page.waitForSelector('tr.track[data-track-id="900000000"]', { timeout: 15000 }),
      'The cart lists the synthetic rows.',
    )
    return { page, timeout: 120000 }
  },

  'rows on screen move exactly as far as the list scrolls': async ({ page }) => {
    const { results, renderedIds, scrollTop } = await scrollAndMeasure(page, 60)
    await page.unroute(CART_PAGE_REQUEST)

    expect(scrollTop, 'the list scrolled past the overscan, so rows moved into the top spacer').to.be.greaterThan(1000)
    const jumps = results.filter(({ scrolled, moved }) => Math.abs(scrolled - moved) > 1)
    expect(jumps, 'steps where the rows moved by a different distance than the list scrolled').to.deep.equal([])
    expect(new Set(renderedIds).size, 'no track is rendered twice').to.equal(renderedIds.length)
  },
})

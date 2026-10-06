// Browser steps shared by the local and preview cart similarity demo tests. Both open the seeded demo cart, start
// "Find similar", and walk through the feature: groups, the map toggle, a group chip, "Not this" and
// "Save group as cart". Only the seeding differs per environment (see cart-similarity-seed.js); these steps do not.

const { expect } = require('chai')
const { waitForWithTimeoutMessage } = require('./setup')
const { titleOf, DEMO_TRACKS } = require('./cart-similarity-seed')

const rowTitles = (page) =>
  page.$$eval('.tracks-table tbody tr.track .title-cell', (cells) => cells.map((c) => c.textContent.trim()))

const nearTitles = DEMO_TRACKS.filter(({ inCart, key }) => !inCart && key.startsWith('Near')).map(({ key }) =>
  titleOf(key),
)
const cartTitles = DEMO_TRACKS.filter(({ inCart }) => inCart).map(({ key }) => titleOf(key))

const pause = (page, ms = 800) => page.waitForTimeout(ms)

module.exports.openCartAndFindSimilar = async (page, cart) => {
  await page.goto(`/carts/${cart.uuid}`)
  await waitForWithTimeoutMessage(
    () => page.waitForSelector('[data-testid="cart-find-similar"]', { timeout: 20000 }),
    'Show the "Find similar" button in the header of the seeded demo cart.',
  )
  await pause(page)
  await page.click('[data-testid="cart-find-similar"]')
  await waitForWithTimeoutMessage(
    () => page.waitForSelector('[data-testid="cart-search-chip"]', { timeout: 60000 }),
    'Show the group chips once the cart similarity search has returned.',
  )
  await waitForWithTimeoutMessage(
    () =>
      page.waitForFunction(
        (token) =>
          Array.from(document.querySelectorAll('.tracks-table tbody tr.track .title-cell')).some((c) =>
            c.textContent.includes(token),
          ),
        'fpcartsimdemo Near',
        { timeout: 30000 },
      ),
    'List tracks similar to the cart.',
  )
  await pause(page, 1500)
}

module.exports.assertGroupedResults = async ({ page }) => {
  const chips = await page.$$('[data-testid="cart-search-chip"]')
  expect(chips.length, 'the demo cart has two styles, so at least two groups').to.be.at.least(2)
  expect(page.url()).to.include('/search?q=cart')

  const titles = await rowTitles(page)
  expect(titles).to.include.members(nearTitles)
  for (const title of cartTitles) expect(titles, 'the cart’s own tracks are never results').to.not.include(title)

  const fits = await page.$$eval('.cart-search-fit .pill-button-contents', (pills) =>
    pills.map((p) => Number(p.textContent.trim())),
  )
  expect(fits.length).to.be.greaterThan(0)
  for (const fit of fits) expect(fit).to.be.within(0, 100)
}

module.exports.toggleMap = async ({ page }) => {
  await page.click('[data-testid="cart-search-map-toggle"]')
  await waitForWithTimeoutMessage(
    () => page.waitForSelector('[data-testid="cart-search-map-result"]', { timeout: 10000 }),
    'Draw the results on the map after turning the Map toggle on.',
  )
  await pause(page, 1500)
  await page.click('[data-testid="cart-search-map-toggle"]')
  await page.waitForSelector('[data-testid="cart-search-map-result"]', { state: 'detached', timeout: 10000 })
}

module.exports.selectGroupAndMarkNotThis = async ({ page }) => {
  await page.click('[data-testid="cart-search-chip"] >> nth=0')
  await waitForWithTimeoutMessage(
    () => page.waitForSelector('#cart-search-chip-0:checked', { state: 'attached', timeout: 10000 }),
    'Select the first group chip.',
  )
  await pause(page)
  const before = await rowTitles(page)
  expect(before.length).to.be.greaterThan(0)
  const missed = before[0]
  await page.click('tr.track [data-testid="cart-search-not-this"] >> nth=0')
  await waitForWithTimeoutMessage(
    () =>
      page.waitForFunction(
        (title) =>
          Array.from(document.querySelectorAll('.cart-search-misses .search_pill_name')).length > 0 &&
          !Array.from(document.querySelectorAll('.tracks-table tbody tr.track .title-cell')).some(
            (c) => c.textContent.trim() === title,
          ),
        missed,
        { timeout: 60000 },
      ),
    'Hide the track marked "Not this" and list it in the Not this pills.',
  )
  await pause(page, 1500)
}

module.exports.saveGroupAsCart = async ({ page }) => {
  await page.click('[data-testid="cart-search-save"]')
  const name = `Cart similarity demo group ${Date.now()}`
  await page.fill('[data-testid="cart-search-save-name"]', name)
  await pause(page)
  await page.click('[data-testid="cart-search-save-submit"]')
  await waitForWithTimeoutMessage(
    () => page.waitForSelector('.cart-search-saved', { timeout: 20000 }),
    'Confirm that the group was saved as a new cart.',
  )
  const carts = await page.evaluate(async () => (await fetch('/api/me/carts', { credentials: 'same-origin' })).json())
  const created = carts.find((c) => c.name === name)
  expect(created, 'the saved group exists as a cart').to.exist
  await pause(page, 1500)
}

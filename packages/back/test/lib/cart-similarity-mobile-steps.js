// Browser steps shared by the local and preview mobile cart similarity demo tests. On a phone the search controls
// must leave room for the track list: the group stepper, New artists only and Map share one row, the group chips
// scroll sideways on a single row, and each result's Fit, cart button and "Not this" are one column of equal width.

const { expect } = require('chai')
const { waitForWithTimeoutMessage } = require('./setup')

const pause = (page, ms = 800) => page.waitForTimeout(ms)

const box = async (locator) => {
  const { x, y, width, height } = await locator.boundingBox()
  return { x, y, width, height, bottom: y + height }
}

const chipCount = (page) => page.$$eval('[data-testid="cart-search-chip"]', (chips) => chips.length)

module.exports.assertCompactControls = async ({ page }) => {
  const toolbar = await page.$eval('.cart-search-toolbar', (el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    items: [...el.children].map((child) => {
      const { y, height } = child.getBoundingClientRect()
      return { top: y, bottom: y + height }
    }),
  }))
  expect(toolbar.items.length, 'group stepper, New artists only and Map').to.equal(3)
  expect(toolbar.scrollWidth, 'the toolbar fits the phone width').to.be.at.most(toolbar.clientWidth)
  const [first, ...rest] = toolbar.items
  for (const item of rest) {
    expect(item.top, 'every toolbar item is on the first one’s row').to.be.below(first.bottom)
    expect(item.bottom).to.be.above(first.top)
  }

  const headerText = await page.$eval('.tracks-table thead', (el) => el.textContent)
  expect(headerText).to.not.include('(auto)')
  expect(headerText).to.not.match(/\d+ groups?/)

  const chips = await page.$eval('.cart-search-chips', (el) => ({
    overflowX: getComputedStyle(el).overflowX,
    tops: [...el.querySelectorAll('label')].map((label) => Math.round(label.getBoundingClientRect().y)),
  }))
  expect(chips.overflowX, 'the chips scroll sideways instead of wrapping').to.equal('auto')
  expect(new Set(chips.tops).size, 'all group chips are on one row').to.equal(1)

  const rowBackground = await page.$eval('tr.cart-search-row', (el) => getComputedStyle(el).backgroundColor)
  for (const selector of ['.cart-search-chips', '.cart-search-toggle']) {
    const background = await page.$eval(selector, (el) => getComputedStyle(el).backgroundColor)
    expect(background, `${selector} is darker than the controls row`).to.not.equal(rowBackground)
  }
  await pause(page, 1500)
}

module.exports.assertActionColumn = async ({ page }) => {
  const row = page.locator('tr.cart-search-track').first()
  const fit = await box(row.locator('.cart-search-fit'))
  const cart = await box(row.locator('.cart-cell .table-cell-button-row'))
  const notThis = await box(row.locator('[data-testid="cart-search-not-this"]'))
  for (const [name, button] of Object.entries({ cart, 'Not this': notThis })) {
    expect(Math.abs(button.x - fit.x), `${name} lines up with Fit`).to.be.below(1)
    expect(Math.abs(button.width - fit.width), `${name} is as wide as Fit`).to.be.below(1)
  }
  expect(cart.y, 'the cart button is below Fit').to.be.at.least(fit.bottom)
  expect(notThis.y, '"Not this" is below the cart button').to.be.at.least(cart.bottom)
}

module.exports.stepGroups = async ({ page }) => {
  const before = await chipCount(page)
  expect(Number(await page.inputValue('[data-testid="cart-search-k"]'))).to.equal(before)

  await page.click('[data-testid="cart-search-coarser"]')
  await waitForWithTimeoutMessage(
    () =>
      page.waitForFunction(
        (count) => document.querySelectorAll('[data-testid="cart-search-chip"]').length === count,
        before - 1,
        { timeout: 60000 },
      ),
    'Show one group fewer after tapping the coarser (−) button.',
  )
  expect(Number(await page.inputValue('[data-testid="cart-search-k"]'))).to.equal(before - 1)
  await pause(page, 1500)

  await page.fill('[data-testid="cart-search-k"]', String(before))
  await page.press('[data-testid="cart-search-k"]', 'Enter')
  await waitForWithTimeoutMessage(
    () =>
      page.waitForFunction(
        (count) => document.querySelectorAll('[data-testid="cart-search-chip"]').length === count,
        before,
        { timeout: 60000 },
      ),
    'Return to the original number of groups after typing it into the group box.',
  )
  await pause(page, 1500)
}

module.exports.scrollChips = async ({ page }) => {
  await page.$eval('.cart-search-chips', (el) => el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' }))
  await pause(page, 1200)
  const lastChip = await box(page.locator('[data-testid="cart-search-chip"]').last())
  const strip = await box(page.locator('.cart-search-chips'))
  expect(lastChip.x + lastChip.width, 'the last chip scrolls into view').to.be.at.most(strip.x + strip.width + 1)
  await page.$eval('.cart-search-chips', (el) => el.scrollTo({ left: 0, behavior: 'smooth' }))
  await pause(page, 1200)
}

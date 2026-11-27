// Browser steps shared by the local and preview cart review playback demo tests. Only the seeding could differ per
// environment (see cart-review-playback-seed.js); these steps do not.

const { expect } = require('chai')
const { waitForWithTimeoutMessage } = require('./setup')
const { OTHER_CART_NAME, titleOf } = require('./cart-review-playback-seed')

const ROW = '.tracks-table tbody tr.track'
const NEXT_BUTTON = 'button[aria-label^="Next"]:visible >> nth=0'
const pause = (page, ms = 800) => page.waitForTimeout(ms)

const rowTitles = (page) => page.$$eval(`${ROW} .title-cell`, (cells) => cells.map((cell) => cell.textContent.trim()))

const rowFor = (page, key) => page.locator(ROW, { has: page.locator('.title-cell', { hasText: titleOf(key) }) })

const waitFor = (page, fn, arg, message, timeout = 10000) =>
  waitForWithTimeoutMessage(() => page.waitForFunction(fn, arg, { timeout }), message)

const waitForRows = async (page, keys, message) => {
  try {
    await page.waitForFunction(
      ({ selector, titles }) =>
        JSON.stringify(
          Array.from(document.querySelectorAll(`${selector} .title-cell`)).map((c) => c.textContent.trim()),
        ) === JSON.stringify(titles),
      { selector: ROW, titles: keys.map(titleOf) },
      { timeout: 10000 },
    )
  } catch (e) {
    throw new Error(`${message} Expected ${keys.join(', ')}, listed: ${(await rowTitles(page)).join(', ')}`)
  }
}

const waitForPlaying = (page, key, message) =>
  waitFor(
    page,
    ({ selector, title }) => document.querySelector(`${selector}.playing .title-cell`)?.textContent.trim() === title,
    { selector: ROW, title: titleOf(key) },
    message,
  )

const showTab = async (page, tab, keys) => {
  await page.click(`[data-testid="cart-review-tab-${tab}"]`)
  await waitForRows(page, keys, `The ${tab} tab should list ${keys.join(', ')}.`)
  await pause(page)
}

const play = async (page, key) => {
  await rowFor(page, key).locator('.title-cell').click()
  await waitForPlaying(page, key, `Clicking the row of ${key} should play it.`)
  await pause(page, 1500)
}

module.exports.openCartAndTurnOnReview = async (page, cart) => {
  await page.goto(`/carts/${cart.uuid}`)
  await waitForWithTimeoutMessage(
    () => page.waitForSelector('[data-testid="cart-review-switch"]', { state: 'attached', timeout: 20000 }),
    'Show the Review switch in the bar of the seeded demo cart.',
  )
  await waitForRows(page, ['PB1', 'PB2', 'PB3', 'PB4', 'PB5', 'PB6'], 'List the six demo tracks.')
  await pause(page)
  await page.click('label.toggle-button:has([data-testid="cart-review-switch"])')
  await waitFor(
    page,
    () => document.querySelector('#cart-review-tab-all')?.checked,
    undefined,
    'Turning review on should open the All tab.',
  )
  await pause(page)
}

// The other cart's entry in the cart menu of a row. On desktop the menu is open while the pointer is over its caret.
const otherCartEntry = async (page, key) => {
  const entry = rowFor(page, key).locator('.cart-popup .cart-button', { hasText: OTHER_CART_NAME }).first()
  if (!(await entry.isVisible())) await rowFor(page, key).locator('.cart-cell .button-drop_down-right').first().hover()
  await waitForWithTimeoutMessage(
    () => entry.waitFor({ state: 'visible', timeout: 10000 }),
    `The cart menu of ${key} should list ${OTHER_CART_NAME}.`,
  )
  return entry
}

// Waits until the other cart's entry in the row's cart menu shows the icon: minus while the track is in that cart.
const waitForEntryIcon = (page, key, icon, message) =>
  waitFor(
    page,
    ({ selector, title, name, icon }) => {
      const row = Array.from(document.querySelectorAll(selector)).find(
        (r) => r.querySelector('.title-cell')?.textContent.trim() === title,
      )
      const entry = Array.from(row?.querySelectorAll('.cart-popup .cart-button') || []).find((button) =>
        button.textContent.includes(name),
      )
      return Boolean(entry?.querySelector(`svg[data-icon="${icon}"]`))
    },
    { selector: ROW, title: titleOf(key), name: OTHER_CART_NAME, icon },
    message,
  )

module.exports.otherCartInRowMenu = async ({ page }) => {
  const entry = await otherCartEntry(page, 'PB2')
  await waitForEntryIcon(page, 'PB2', 'minus', `The cart menu shows PB2 in ${OTHER_CART_NAME}.`)
  await pause(page)
  await entry.click()
  await waitForEntryIcon(page, 'PB2', 'plus', `Removing PB2 from ${OTHER_CART_NAME} should switch its entry to add.`)
  await pause(page, 1500)
  await (await otherCartEntry(page, 'PB2')).click()
  await waitForEntryIcon(
    page,
    'PB2',
    'minus',
    `Adding PB2 back to ${OTHER_CART_NAME} should switch its entry to remove.`,
  )
  await pause(page)
  await page.mouse.move(5, 5)
}

module.exports.nextPlaysTheAcceptedTab = async ({ page }) => {
  await showTab(page, 'accepted', ['PB1', 'PB3'])
  await play(page, 'PB1')
  await page.click(NEXT_BUTTON)
  await waitForPlaying(page, 'PB3', 'Next on the Accepted tab should play the next accepted track.')
  await pause(page, 1500)
}

module.exports.nextSkipsATrackRemovedFromTheCart = async ({ page }) => {
  await showTab(page, 'to-review', ['PB2', 'PB5', 'PB6'])
  await play(page, 'PB2')
  const cartButton = rowFor(page, 'PB5').locator('.cart-cell .button-drop_down-left').first()
  await cartButton.click()
  await waitFor(
    page,
    ({ selector, title }) => {
      const row = Array.from(document.querySelectorAll(selector)).find(
        (r) => r.querySelector('.title-cell')?.textContent.trim() === title,
      )
      return row?.querySelector('.cart-cell .button-drop_down-left')?.title.toLowerCase().includes('add to cart')
    },
    { selector: ROW, title: titleOf('PB5') },
    'Removing PB5 from the cart keeps its row with an add button.',
  )
  await waitForPlaying(page, 'PB2', 'Removing another track from the cart keeps PB2 playing.')
  await pause(page, 1500)
  await page.click(NEXT_BUTTON)
  await waitForPlaying(page, 'PB6', 'Next should step over PB5, which is no longer in the cart.')
  expect(await rowTitles(page)).to.include(titleOf('PB5'))
  await pause(page, 1500)
}

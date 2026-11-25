const { expect } = require('chai')
const { dismissOnboarding, waitForWithTimeoutMessage } = require('./setup')

// Shared browser interactions/assertions for the "removing a track from the cart on screen keeps it listed" demo.
// Both the local (demo-test) and preview (demo-preview) entry files import these verbatim; only the seeding of the
// tracks differs (and that is itself shared via seedTracks, which branches on PREVIEW_URL).

const TRACK_SELECTOR = '.tracks-table .track'
const PLAYER_CART_BUTTON = '.preview_actions_wrapper .button-drop_down-left'

const rowByTitle = (page, title) =>
  page.locator(TRACK_SELECTOR).filter({ has: page.locator('.title-cell', { hasText: title }) }).first()

const rowCartButton = (page, title) => rowByTitle(page, title).locator('.cart-cell .button-drop_down-left').first()

const expectTitle = async (locator, expected) => {
  const deadline = Date.now() + 10000
  for (;;) {
    const title = ((await locator.getAttribute('title', { timeout: 10000 })) || '').toLowerCase()
    if (title.includes(expected.toLowerCase())) return
    if (Date.now() > deadline) throw new Error(`Expected title to include "${expected}", got "${title}"`)
    await locator.page().waitForTimeout(100)
  }
}

const openDefaultCart = async (page) => {
  const cartsButton = page.locator('.menu_left a, .menu_left button').filter({ hasText: 'Carts' }).first()
  await waitForWithTimeoutMessage(
    () => cartsButton.waitFor({ state: 'visible', timeout: 15000 }),
    'Find the carts button in the top navigation.',
  )
  await cartsButton.click({ timeout: 10000 })
  await waitForWithTimeoutMessage(
    () => page.waitForURL(/\/carts\/[^/]+/, { timeout: 10000 }),
    'Open the default cart from the top navigation.',
  )
  await waitForWithTimeoutMessage(
    () => page.waitForSelector(TRACK_SELECTOR, { timeout: 15000 }),
    'The default cart lists the track added to it.',
  )
}

// Plays the first recent track and puts it in the default cart with the player's cart button, as a user would.
// Returns the track's title. Idempotent: a track left in the cart by an earlier run stays there.
const addFirstRecentTrackToDefaultCart = async (page) => {
  await page.goto('/tracks/recent')
  try {
    await page.waitForSelector(TRACK_SELECTOR, { timeout: 20000 })
  } catch {
    await page.goto('/tracks/recent')
    await waitForWithTimeoutMessage(
      () => page.waitForSelector(TRACK_SELECTOR, { timeout: 20000 }),
      'Load the recent tracks with at least one seeded row.',
    )
  }
  await dismissOnboarding(page)
  const firstRow = page.locator(TRACK_SELECTOR).first()
  const title = (await firstRow.locator('.title-cell').first().innerText()).trim()
  await firstRow.click()
  const playerCartButton = page.locator(PLAYER_CART_BUTTON).first()
  await waitForWithTimeoutMessage(
    () => playerCartButton.waitFor({ state: 'visible', timeout: 10000 }),
    "Show the player's cart button for the playing track.",
  )
  const buttonTitle = ((await playerCartButton.getAttribute('title')) || '').toLowerCase()
  if (buttonTitle.includes('add to default cart')) {
    await playerCartButton.click({ timeout: 10000 })
    await expectTitle(playerCartButton, 'remove from default cart')
  }
  return title
}

const assertRemovedTrackStaysListedWithAddButton = async ({ page, trackTitle }) => {
  await openDefaultCart(page)
  const button = rowCartButton(page, trackTitle)
  await expectTitle(button, 'remove from cart')

  await button.click({ timeout: 10000 })
  await expectTitle(button, 'add to cart')
  expect(await rowByTitle(page, trackTitle).count(), 'the removed track is still listed').to.equal(1)
  await page.waitForTimeout(500) // let the recording show the switched button
}

const assertAddButtonPutsTheTrackBack = async ({ page, trackTitle }) => {
  const button = rowCartButton(page, trackTitle)
  await expectTitle(button, 'add to cart')
  await button.click({ timeout: 10000 })
  await expectTitle(button, 'remove from cart')
  expect(await rowByTitle(page, trackTitle).count(), 'the track is listed once').to.equal(1)
}

const assertRemovedTrackIsGoneAfterReload = async ({ page, trackTitle }) => {
  const button = rowCartButton(page, trackTitle)
  await button.click({ timeout: 10000 })
  await expectTitle(button, 'add to cart')

  await page.reload()
  await waitForWithTimeoutMessage(
    () =>
      page.waitForFunction(() => document.querySelector('.cart-details')?.textContent.includes('Tracks in cart:'), null, {
        timeout: 15000,
      }),
    'Reload the cart.',
  )
  await page.waitForTimeout(1000)
  expect(await rowByTitle(page, trackTitle).count(), 'the removed track is not listed after the reload').to.equal(0)
}

module.exports = {
  addFirstRecentTrackToDefaultCart,
  assertRemovedTrackStaysListedWithAddButton,
  assertAddButtonPutsTheTrackBack,
  assertRemovedTrackIsGoneAfterReload,
}

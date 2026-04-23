const { expect } = require('chai')
const { test } = require('cascade-test')
const { getSharedContext, dismissOnboarding, waitForWithTimeoutMessage } = require('../lib/setup')
const { seedTracks } = require('../lib/seed')
const { resolveTestUserId } = require('../lib/test-user')

const getDefaultCartButton = (page) => page.locator('.preview_actions_wrapper .button-drop_down-left').first()

const selectTrackAndReadTitle = async (page, index = 0) => {
  const targetTrack = page.locator('.track').nth(index)
  await targetTrack.click()
  await waitForWithTimeoutMessage(
    () =>
      page.waitForFunction(
        (rowIndex) => {
          const row = document.querySelectorAll('.track')[rowIndex]
          return !!row?.classList.contains('selected')
        },
        index,
        { timeout: 10000 },
      ),
    'Select the target track before reading title and cart controls.',
  )
  const title = (await targetTrack.locator('.title-cell').first().innerText()).trim()
  return title
}

const waitForCartButtonTitle = async (page, expectedText) => {
  await waitForWithTimeoutMessage(
    () =>
      page.waitForFunction(
        (text) => {
          const title = document.querySelector('.preview_actions_wrapper .button-drop_down-left')?.getAttribute('title')
          return typeof title === 'string' && title.toLowerCase().includes(text)
        },
        expectedText.toLowerCase(),
        { timeout: 10000 },
      ),
    `Wait for cart button title to include "${expectedText}".`,
  )
}

const ensureTrackNotInDefaultCart = async (page) => {
  const cartButton = getDefaultCartButton(page)
  await waitForWithTimeoutMessage(
    () => cartButton.waitFor({ state: 'visible', timeout: 10000 }),
    'Ensure cart button is visible before checking membership.',
  )
  const title = (await cartButton.getAttribute('title')) || ''
  if (title.toLowerCase().includes('remove')) {
    await cartButton.click({ timeout: 10000 })
    await waitForCartButtonTitle(page, 'add to default cart')
  }
}

const ensureTrackInDefaultCart = async (page) => {
  const cartButton = getDefaultCartButton(page)
  await waitForWithTimeoutMessage(
    () => cartButton.waitFor({ state: 'visible', timeout: 10000 }),
    'Ensure cart button is visible before checking membership.',
  )
  const title = (await cartButton.getAttribute('title')) || ''
  if (title.toLowerCase().includes('add to default cart')) {
    await cartButton.click({ timeout: 10000 })
    await waitForCartButtonTitle(page, 'remove from default cart')
  }
}

const openDefaultCart = async (page) => {
  const cartsButton = page.locator('.menu_left a, .menu_left button').filter({ hasText: 'Carts' }).first()
  await waitForWithTimeoutMessage(
    () => cartsButton.waitFor({ state: 'visible', timeout: 10000 }),
    'Find the carts button in top navigation.',
  )
  await cartsButton.click({ timeout: 10000 })
  await waitForWithTimeoutMessage(
    () => page.waitForURL(/\/carts\/[^/]+/, { timeout: 10000 }),
    'Open the default cart route from top navigation.',
  )
  await waitForWithTimeoutMessage(
    () =>
      page.waitForFunction(
        () => {
          const details = document.querySelector('.cart-details')
          return !!details && details.textContent.includes('Tracks in cart:')
        },
        { timeout: 10000 },
      ),
    'Wait for cart details header to render after opening carts.',
  )
}

test({
  setup: async () => {
    const { page } = await getSharedContext()
    const userId = await resolveTestUserId()
    await seedTracks({ userIds: [userId] })
    await page.goto('/tracks/recent')
    await waitForWithTimeoutMessage(
      () => page.waitForSelector('.tracks-table', { timeout: 15000 }),
      'Load the tracks table before running cart flows.',
    )
    await dismissOnboarding(page)
    await page.locator('.track').first().click()
    return { page, timeout: 30000 }
  },

  'added track is shown after opening default cart': async ({ page }) => {
    await page.goto('/tracks/recent')
    await waitForWithTimeoutMessage(
      () => page.waitForSelector('.tracks-table', { timeout: 15000 }),
      'Load tracks page before asserting add-to-cart behavior.',
    )
    const selectedTitle = await selectTrackAndReadTitle(page, 0)
    await ensureTrackNotInDefaultCart(page)

    await getDefaultCartButton(page).click({ timeout: 10000 })
    await waitForCartButtonTitle(page, 'remove from default cart')

    await openDefaultCart(page)
    const tracksInCart = await page.locator('.track .title-cell').allInnerTexts()
    expect(tracksInCart.map((title) => title.trim())).to.include(selectedTitle)
  },

  'removed track is hidden after opening default cart': async ({ page }) => {
    await page.goto('/tracks/recent')
    await waitForWithTimeoutMessage(
      () => page.waitForSelector('.tracks-table', { timeout: 15000 }),
      'Load tracks before preparing remove flow.',
    )
    const selectedTitle = await selectTrackAndReadTitle(page, 0)
    await ensureTrackInDefaultCart(page)

    await getDefaultCartButton(page).click({ timeout: 10000 })
    await waitForCartButtonTitle(page, 'add to default cart')

    await openDefaultCart(page)
    const tracksInCart = await page.locator('.track .title-cell').allInnerTexts()
    expect(tracksInCart.map((title) => title.trim())).to.not.include(selectedTitle)
  },
})

const { expect } = require('chai')
const { dismissOnboarding, waitForWithTimeoutMessage } = require('./setup')

// Shared steps for the subscription-unavailable demo: with a search active and no verified email, the top bar shows
// "Subscription unavailable" (an exclamation icon only, on narrow screens). Hovering it (desktop) or tapping it (mobile)
// opens a popup saying why and linking to Settings › Email, where the address is set and verified.

const SEARCH = 'techno'
const INFO = '.email_not_verified_container'
const POPUP = `${INFO} .popup_content`

const openSearch = async (page) => {
  await page.goto(`/search/?q=${SEARCH}`)
  await waitForWithTimeoutMessage(
    () => page.waitForSelector('.menu_search input', { state: 'visible', timeout: 20000 }),
    'The top bar search should be visible.',
  )
  await dismissOnboarding(page)
}

const assertPopupExplains = async (page) => {
  const popup = page.locator(POPUP)
  await waitForWithTimeoutMessage(
    () => popup.waitFor({ state: 'visible', timeout: 5000 }),
    'The popup explaining why subscribing is unavailable should open.',
  )
  const text = await popup.textContent()
  expect(text).to.contain('verified email')
  const link = popup.locator('a[href="/settings/email"]')
  expect(await link.isVisible()).to.equal(true)
  // The popup is on screen, not cut off by the top bar
  const box = await popup.boundingBox()
  const viewport = page.viewportSize()
  expect(box.x).to.be.at.least(0)
  expect(box.y).to.be.at.least(0)
  expect(box.x + box.width).to.be.at.most(viewport.width + 1)
  expect(box.y + box.height).to.be.at.most(viewport.height + 1)
}

// Desktop: hovering the warning opens the popup, and its link opens Settings › Email
const assertHoverExplainsOnDesktop = async ({ page }) => {
  await openSearch(page)
  await page.locator('.menu_search input').focus()
  const anchor = page.locator(`${INFO} .popup-anchor`)
  await waitForWithTimeoutMessage(
    () => anchor.waitFor({ state: 'visible', timeout: 10000 }),
    'Without a verified email the top bar should say subscribing is unavailable.',
  )
  await anchor.hover()
  await assertPopupExplains(page)
  await page.locator(`${POPUP} a[href="/settings/email"]`).click()
  await page.waitForURL(/\/settings\/email/, { timeout: 10000 })
}

// Mobile: only the icon shows; tapping it opens the popup, tapping outside closes it
const assertTapExplainsOnMobile = async ({ mobilePage: page }) => {
  await openSearch(page)
  await page.locator('.menu_search input').tap()
  const anchor = page.locator(`${INFO} .popup-anchor`)
  await waitForWithTimeoutMessage(
    () => anchor.waitFor({ state: 'visible', timeout: 10000 }),
    'Without a verified email the top bar should show the warning icon.',
  )
  expect(await page.locator(`${INFO} .button-top_bar_button_label`).isVisible()).to.equal(false)
  await anchor.tap()
  await assertPopupExplains(page)
  // The dimmed backdrop next to the popup closes it
  await page.locator(`${INFO} + .popup_overlay`).tap({ position: { x: 10, y: 10 } })
  await page.locator(POPUP).waitFor({ state: 'hidden', timeout: 5000 })
}

module.exports = { assertHoverExplainsOnDesktop, assertTapExplainsOnMobile }

const { expect } = require('chai')
const { dismissOnboarding, waitForWithTimeoutMessage } = require('./setup')

// Shared steps for the search-bar-navigation demo: the top bar search keeps its magnifying glass (centred) without
// focus; Settings keeps an active search with a way back to its results; going back to a search shows its terms at
// once, before the results arrive; and another track list (Discover) or Notifications empties the bar. The label
// comes from the Concussion fixture the one-player seed adds.

const LABEL = 'Vision Recordings'
const TEXT = 'concussion'
const BAR = '.menu_search'
const SEARCH_REQUEST = '**/api/tracks?**'

const pillNames = (page) => page.locator(`${BAR} .search_pill .search_pill_name`).allTextContents()

const iconPosition = (page) =>
  page.evaluate((bar) => {
    const icon = document.querySelector(`${bar} .search-input-icon svg`)
    const box = document.querySelector(`${bar} .search_bar`).getBoundingClientRect()
    if (!icon || !icon.getBoundingClientRect().height) return null
    const r = icon.getBoundingClientRect()
    return { iconCentre: r.top + r.height / 2, barCentre: box.top + box.height / 2 }
  }, BAR)

const expectIconCentred = async (page, when) => {
  const position = await iconPosition(page)
  expect(position, `The search icon should show ${when}.`).to.not.equal(null)
  expect(Math.abs(position.iconCentre - position.barCentre), `The search icon should be centred ${when}.`).to.be.below(
    1.5,
  )
}

const openDiscover = async (page) => {
  await page.goto('/tracks/new')
  await page.waitForSelector(`${BAR} input`, { state: 'visible', timeout: 20000 })
  await dismissOnboarding(page)
}

const assertSearchIconShownAndCentred = async ({ page }) => {
  await page.locator('body').click({ position: { x: 5, y: 300 } })
  await expectIconCentred(page, 'without focus')
  await page.locator(`${BAR} input`).click()
  await expectIconCentred(page, 'with focus')
}

// The label picked from the lookup and a text term, searched with Enter
const searchLabelAndText = async (page) => {
  const input = page.locator(`${BAR} input`)
  await input.click()
  await input.pressSequentially(`label:${LABEL}`, { delay: 40 })
  const suggestion = page.locator(`${BAR} .search_genre_option`, { hasText: LABEL }).first()
  await waitForWithTimeoutMessage(
    () => suggestion.waitFor({ state: 'visible', timeout: 10000 }),
    `Typing label:${LABEL} should suggest it.`,
  )
  await suggestion.click()
  await input.pressSequentially(`${TEXT} `, { delay: 40 })
  await input.press('Enter')
  await page.waitForURL(/\/search\?/, { timeout: 10000 })
  expect(await pillNames(page)).to.deep.equal([LABEL, TEXT])
  await expectIconCentred(page, 'with a search active')
}

const assertSettingsKeepsSearchWithWayBack = async ({ page }) => {
  await searchLabelAndText(page)
  await page.locator('a[href="/settings/following"]').first().click()
  await page.waitForURL(/\/settings/, { timeout: 10000 })
  await page.locator('.settings-container').first().waitFor({ state: 'visible', timeout: 10000 })
  expect(await pillNames(page)).to.deep.equal([LABEL, TEXT])
  const showResults = page.locator('.show_search_results_link')
  await waitForWithTimeoutMessage(
    () => showResults.waitFor({ state: 'visible', timeout: 5000 }),
    'Settings should offer a way back to the search results.',
  )
  // An outlined pill link (navigation), not a primary button; hovering it does not move it from under the pointer
  expect(await showResults.evaluate((el) => el.tagName === 'A' && el.classList.contains('pill-link'))).to.equal(true)
  // Spaced from the search bar like the Subscribe button is
  const barRight = await page.locator(`${BAR} .search_container`).evaluate((el) => el.getBoundingClientRect().right)
  const before = await showResults.boundingBox()
  expect(before.x - barRight, 'Show results should be spaced from the search bar.').to.be.at.least(8)
  await showResults.hover()
  await page.waitForTimeout(400)
  const after = await showResults.boundingBox()
  expect(Math.abs(after.x - before.x), 'Hovering "Show results" should not move it.').to.be.below(1)
  await showResults.click()
  await page.waitForURL(/\/search\?/, { timeout: 10000 })
  expect(await pillNames(page)).to.deep.equal([LABEL, TEXT])
  // Settings closes as the results open
  await waitForWithTimeoutMessage(
    () => page.locator('.settings-container').first().waitFor({ state: 'hidden', timeout: 5000 }),
    'Settings should close when the results open.',
  )
}

// Back from Settings to the search: the terms show before the (slowed down) search answers
const assertBackShowsSearchAtOnce = async ({ page }) => {
  await page.locator('a[href="/settings/following"]').first().click()
  await page.waitForURL(/\/settings/, { timeout: 10000 })
  await page.route(SEARCH_REQUEST, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 4000))
    await route.continue().catch(() => {})
  })
  try {
    await page.goBack()
    await page.waitForURL(/\/search\?/, { timeout: 10000 })
    await page.waitForTimeout(300)
    expect(await pillNames(page)).to.deep.equal([LABEL, TEXT])
    expect(await page.locator('.show_search_results_link').count()).to.equal(0)
  } finally {
    await page.unroute(SEARCH_REQUEST)
  }
}

// On a phone: search, open Settings from the top bar, tap "Show results": the results open again
const assertShowResultsTapOnMobile = async ({ mobilePage: page }) => {
  await openDiscover(page)
  await searchLabelAndText(page)
  // Leave the search so the menu buttons show again on a narrow screen
  await page.locator('.menu_search input').blur()
  await page.locator('a[href="/settings/following"]').first().tap()
  await page.waitForURL(/\/settings/, { timeout: 10000 })
  const showResults = page.locator('.show_search_results_link')
  await waitForWithTimeoutMessage(
    () => showResults.waitFor({ state: 'visible', timeout: 5000 }),
    'Settings should offer a way back to the search results on a phone too.',
  )
  await showResults.tap()
  await page.waitForURL(/\/search\?/, { timeout: 10000 })
  expect(await pillNames(page)).to.deep.equal([LABEL, TEXT])
  await page.locator('.settings-container').first().waitFor({ state: 'hidden', timeout: 5000 })
}

// Opening the page behind the link empties the bar, entity and text terms alike, with no way back offered
const expectLinkClearsSearch = async (page, href, url) => {
  await page.locator(`a[href="${href}"]`).first().click()
  await page.waitForURL(url, { timeout: 10000 })
  await page.waitForFunction((bar) => !document.querySelector(`${bar} .search_pill`), BAR, { timeout: 5000 })
  expect(await page.locator(`${BAR} input`).inputValue()).to.equal('')
  expect(await page.locator('.show_search_results_link').count()).to.equal(0)
}

// Another track list replaces the search
const assertOtherListClearsSearch = ({ page }) => expectLinkClearsSearch(page, '/tracks/new', /\/tracks\/new/)

// So does Notifications
const assertNotificationsClearsSearch = async ({ page }) => {
  await searchLabelAndText(page)
  await expectLinkClearsSearch(page, '/notifications/activity', /\/notifications\/activity/)
}

module.exports = {
  openDiscover,
  assertSearchIconShownAndCentred,
  assertSettingsKeepsSearchWithWayBack,
  assertBackShowsSearchAtOnce,
  assertShowResultsTapOnMobile,
  assertOtherListClearsSearch,
  assertNotificationsClearsSearch,
}

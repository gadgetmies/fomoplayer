const { expect } = require('chai')
const { waitForWithTimeoutMessage } = require('./setup')

// Shared browser interactions/assertions for the docked player controls demo on wider screens. Preview and Listen sit
// on the ends of the docked bar's waveform, as on the full player's; after the waveform come cart, find similar, follow
// and ignore as icons and an expand button that opens a popup above them with share and the store links, stacked. The phone layout has its own
// steps (docked-player-controls-mobile-steps.js). Both entry files import these verbatim; the tracks are seeded
// through the API in both.

const row = (page) => page.locator('.docked-player_row')
const barEnd = (page) => page.locator('.docked-player_end')
const waveformSwitch = (page, text) =>
  page.locator('[data-testid="docked-player-waveform"] label', { hasText: text }).first()
const more = (page) => page.locator('[data-testid="docked-player-more"]')
const toggle = (page) => page.locator('.docked-player .docked-player_expand')

const assertStillPlaying = async (page) => {
  expect(await page.$eval('audio', (audio) => audio.paused)).to.equal(false)
}

const assertRowHasMainActions = async ({ page }) => {
  for (const name of [/similar/i, /Follow/, /Ignore/]) {
    await waitForWithTimeoutMessage(
      () => barEnd(page).getByRole('button', { name }).first().waitFor({ state: 'visible', timeout: 5000 }),
      `The docked bar should show the ${name.source} button.`,
    )
  }
  expect(await barEnd(page).locator('.button-drop_down-left').getAttribute('title')).to.match(/cart/i)
  // Icons only: the labels are hidden
  const visibleLabels = await barEnd(page)
    .locator('.button-push_button_label')
    .evaluateAll((labels) => labels.filter((label) => label.offsetParent !== null).length)
  expect(visibleLabels).to.equal(0)
  // On the right: after the waveform, ending at the bar's right edge
  const waveform = await page.locator('[data-testid="docked-player-waveform"]').boundingBox()
  const end = await barEnd(page).boundingBox()
  const section = await page.locator('.docked-player').boundingBox()
  expect(end.x).to.be.at.least(waveform.x + waveform.width - 1)
  expect(Math.abs(end.x + end.width - (section.x + section.width))).to.be.below(2)
  // The waveform fills the bar's height
  const main = await page.locator('.docked-player_main').boundingBox()
  expect(main.height - waveform.height).to.be.below(4)
  // Preview and Listen on the waveform's lower left and right ends, in place of the position and duration
  const preview = await waveformSwitch(page, 'Preview').boundingBox()
  const listen = await waveformSwitch(page, 'Listen').boundingBox()
  expect(preview.x - waveform.x).to.be.below(24)
  expect(waveform.x + waveform.width - (listen.x + listen.width)).to.be.below(24)
  for (const label of [preview, listen]) {
    expect(label.y).to.be.at.least(waveform.y)
    expect(label.y + label.height).to.be.at.most(waveform.y + waveform.height + 1)
  }
  expect(
    await page
      .locator('.docked-player')
      .getByText(/^\d+:\d\d$/)
      .count(),
  ).to.equal(0)
  // Share and the store links wait behind the expand button
  expect(await barEnd(page).getByRole('button', { name: /Share/ }).count()).to.equal(0)
  expect(await more(page).count()).to.equal(0)
}

// The cart button adds the track to the default cart and removes it again (so re-runs start from the same state)
const assertCartButtonToggles = async ({ page }) => {
  const selector = '.docked-player_end .button-drop_down-left'
  const before = await page.locator(selector).getAttribute('title')
  const waitForTitle = (changed) =>
    page.waitForFunction(
      ({ selector, before, changed }) => {
        const button = document.querySelector(selector)
        return button && !button.disabled && (button.getAttribute('title') !== before) === changed
      },
      { selector, before, changed },
      { timeout: 10000 },
    )
  await page.locator(selector).click()
  await waitForWithTimeoutMessage(
    () => waitForTitle(true),
    'The cart button in the docked bar should add the track to (or remove it from) the default cart.',
  )
  await page.locator(selector).click()
  await waitForTitle(false)
}

// Preview / Listen on the bar's waveform change the same setting as the ones over the full player's, without seeking
const assertSourceToggleSwitches = async ({ page }) => {
  const initial = await page.evaluate(() => localStorage.getItem('preferFullTracks'))
  await waveformSwitch(page, 'Listen').click()
  expect(await page.evaluate(() => localStorage.getItem('preferFullTracks'))).to.equal('true')
  await page.waitForTimeout(500)
  await waveformSwitch(page, 'Preview').click()
  expect(await page.evaluate(() => localStorage.getItem('preferFullTracks'))).to.equal('false')
  if (initial === 'true') await waveformSwitch(page, 'Listen').click()
}

const openMore = async ({ page }) => {
  expect(await toggle(page).getAttribute('aria-expanded')).to.equal('false')
  await toggle(page).click()
  await waitForWithTimeoutMessage(
    () => more(page).waitFor({ state: 'visible', timeout: 5000 }),
    'The expand button should open the popup with the rest of the controls.',
  )
  const section = await page.locator('.docked-player').boundingBox()
  const main = await page.locator('.docked-player_main').boundingBox()
  const panel = await more(page).boundingBox()
  // Above the bar at its right edge, leaving the rest of the page uncovered
  expect(panel.y + panel.height).to.be.at.most(main.y + 1)
  expect(Math.abs(panel.x + panel.width - (section.x + section.width))).to.be.below(2)
  expect(panel.width).to.be.below(section.width / 2)
  // Stacked: share, then the store links, then the searches
  const share = await more(page).getByRole('button', { name: /Share/ }).boundingBox()
  const wrappers = more(page).locator('.preview_links_wrapper')
  expect(await wrappers.first().textContent()).to.match(/Open in store|Available on/)
  const storeLinks = await wrappers.first().boundingBox()
  expect(storeLinks.y).to.be.at.least(share.y + share.height - 1)
  if ((await wrappers.count()) > 1) {
    const searches = await wrappers.nth(1).boundingBox()
    expect(await wrappers.nth(1).textContent()).to.contain('Search')
    expect(searches.y).to.be.at.least(storeLinks.y + storeLinks.height - 1)
  }
  // The links in each group are stacked too
  const linkTops = await more(page)
    .locator('.search_from_list a, .available_on_list a')
    .evaluateAll((links) =>
      links.map((link) => link.getBoundingClientRect()).map(({ top, bottom }) => ({ top, bottom })),
    )
  expect(linkTops.length).to.be.at.least(2)
  linkTops.slice(1).forEach(({ top }, index) => expect(top).to.be.at.least(linkTops[index].bottom - 1))
  expect(await more(page).getByRole('slider').count()).to.equal(0)
  await assertStillPlaying(page)
}

// The share popup opens to the left of the bar's popup, which sits at the viewport's right edge. Like the full
// player's, it opens on hover with a mouse (and stays open while the pointer moves over to it) and on tap on phones.
const assertSharePopupOpens = async ({ page }) => {
  const shareButton = more(page).getByRole('button', { name: /Share/ })
  await shareButton.click()
  const popup = more(page).locator('.popup_container:has(button:has-text("Share")) .popup_content')
  await waitForWithTimeoutMessage(
    () => popup.waitFor({ state: 'visible', timeout: 5000 }),
    'Share in the popup should open its own popup.',
  )
  expect(await popup.textContent()).to.contain('Copy')
  const popupBox = await popup.boundingBox()
  const moreBox = await more(page).boundingBox()
  const viewport = page.viewportSize()
  expect(popupBox.x + popupBox.width).to.be.at.most(moreBox.x + 1)
  expect(popupBox.x).to.be.at.least(0)
  expect(popupBox.y).to.be.at.least(0)
  expect(popupBox.y + popupBox.height).to.be.at.most(viewport.height)
  await page.mouse.move(popupBox.x + popupBox.width / 2, popupBox.y + 10, { steps: 10 })
  expect(await popup.isVisible()).to.equal(true)
  await page.waitForTimeout(1000)
  await more(page).locator('.preview_links_wrapper').first().hover()
}

const assertExpandButtonAndEscapeCloseMore = async ({ page }) => {
  await toggle(page).click()
  await more(page).waitFor({ state: 'detached', timeout: 5000 })
  await toggle(page).click()
  await more(page).waitFor({ state: 'visible', timeout: 5000 })
  await page.keyboard.press('Escape')
  await more(page).waitFor({ state: 'detached', timeout: 5000 })
  expect(await toggle(page).getAttribute('aria-expanded')).to.equal('false')
  await assertStillPlaying(page)
}

module.exports = {
  assertRowHasMainActions,
  assertCartButtonToggles,
  assertSourceToggleSwitches,
  openMore,
  assertSharePopupOpens,
  assertExpandButtonAndEscapeCloseMore,
}

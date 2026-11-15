const { expect } = require('chai')
const { waitForWithTimeoutMessage } = require('./setup')
const player = require('./player-steps')

// Shared browser interactions/assertions for the docked player controls demo on a phone (the touch-enabled Pixel 5
// context). On Settings the docked bar is the waveform, with Preview / Listen on its ends, above play, previous, next
// and the track; expanding it shows the full player the track lists show (details, waveform with Preview / Listen,
// then the controls) with the waveform, buttons, switches and spacing in the same places. The button in the details'
// top right corner or a tap outside goes back. Below 430px previous is hidden so the button row, share included, fits.
// Both entry files import these verbatim; the tracks are seeded through the API.

// Below this viewport width previous gives way so the panel's button row fits
const PREVIOUS_HIDDEN_BELOW = 430

const toggle = (page) => page.locator('.docked-player .docked-player_expand')
const openPanel = (page) => page.locator('.preview--docked-expanded')

// The bar's and the expanded player's waveform, Preview / Listen, playback buttons and button row, to compare them
const measure = async (page, scope) => {
  const [waveformSelector, switchesSelector, rowSelector] =
    scope === 'bar'
      ? [
          '[data-testid="docked-player-waveform"] .waveform_container',
          '[data-testid="docked-player-waveform"]',
          '.docked-player_row',
        ]
      : [
          '.preview--docked-expanded .preview-player .preview-wrapper .waveform_container',
          '.preview--docked-expanded .preview-player .preview-wrapper',
          '.preview--docked-expanded .preview-player .button-wrapper',
        ]
  const box = (locator) => locator.first().boundingBox()
  const previousVisible = await page.locator(`${rowSelector} .button-playback--previous`).isVisible()
  // Play, (previous,) next: the playback buttons left in the row
  const playback = page.locator(`${rowSelector} .button-playback:visible`)
  const [waveform, preview, listen, play, next, buttonRow] = await Promise.all([
    box(page.locator(waveformSelector)),
    box(page.locator(`${switchesSelector} label`, { hasText: 'Preview' })),
    box(page.locator(`${switchesSelector} label`, { hasText: 'Listen' })),
    box(playback.nth(0)),
    box(playback.nth(previousVisible ? 2 : 1)),
    box(page.locator(rowSelector)),
  ])
  return {
    waveform,
    preview,
    listen,
    play,
    next,
    buttonRow,
    previousVisible,
    gap: buttonRow.y - (waveform.y + waveform.height),
  }
}
let barSizes

// Start a track from Discover · Recent and open Settings in the app (a client-side navigation keeps it playing)
const playAndOpenSettingsOnPhone = async (page) => {
  await page.goto('/tracks/recent')
  const seededRow = page.locator('.tracks-table .track:has-text("One Player Demo")').first()
  try {
    await seededRow.waitFor({ state: 'visible', timeout: 20000 })
  } catch {
    // The remote preview can be cold right after a deploy, so reload once before giving up
    await page.goto('/tracks/recent')
    await waitForWithTimeoutMessage(
      () => seededRow.waitFor({ state: 'visible', timeout: 20000 }),
      'Find the seeded tracks in the Recent list on the phone.',
    )
  }
  await seededRow.click()
  await waitForWithTimeoutMessage(
    () => player.audioIsPlaying(page),
    'Tapping a track on the phone should start playing it.',
  )
  await page.waitForTimeout(1000)
  await page.locator('a[href^="/settings"]').first().click()
  await page.waitForSelector('.settings-container', { state: 'visible', timeout: 10000 })
  await waitForWithTimeoutMessage(
    () => page.locator('.docked-player').waitFor({ state: 'visible', timeout: 5000 }),
    'Settings on the phone should show the docked player.',
  )
}

// The waveform above play, previous, next, the track and the expand button; nothing else in the bar
const assertBarWaveformAboveControls = async ({ page }) => {
  const waveform = await page.locator('[data-testid="docked-player-waveform"]').boundingBox()
  const controls = await page.locator('.docked-player_row').boundingBox()
  expect(waveform.y + waveform.height).to.be.at.most(controls.y + 1)
  expect(waveform.width).to.be.at.least(page.viewportSize().width - 4)
  expect(await page.locator('.docked-player_actions').isVisible()).to.equal(false)
  // Preview and Listen on the waveform's ends, in place of the position and duration
  for (const text of ['Preview', 'Listen']) {
    const label = page.locator('[data-testid="docked-player-waveform"] label', { hasText: text }).first()
    expect(await label.isVisible()).to.equal(true)
  }
  barSizes = await measure(page, 'bar')
  expect(barSizes.previousVisible, 'previous in the bar').to.equal(page.viewportSize().width >= PREVIOUS_HIDDEN_BELOW)
  // The expand button shares the controls' line
  const expand = await toggle(page).boundingBox()
  expect(expand.y).to.be.at.least(controls.y - 1)
  expect(expand.y + expand.height).to.be.at.most(controls.y + controls.height + 1)
  await player.assertStillPlaying(page)
}

// Tapping the bar's waveform seeks
const assertBarWaveformSeeks = async ({ page }) => {
  const waveform = page.locator('[data-testid="docked-player-waveform"]')
  const box = await waveform.boundingBox()
  const before = await page.$eval('audio', (audio) => audio.currentTime)
  await waveform.tap({ position: { x: box.width * 0.75, y: box.height / 2 } })
  await waitForWithTimeoutMessage(
    () =>
      page.waitForFunction((previous) => Math.abs(document.querySelector('audio').currentTime - previous) > 5, before, {
        timeout: 5000,
      }),
    'Tapping the docked waveform should seek.',
  )
}

// Expanding shows the full player of the track lists: details, the waveform, then the controls
const assertExpandShowsFullPlayer = async ({ page }) => {
  await toggle(page).tap()
  const details = page.locator('.preview--docked-expanded > .preview_details_wrapper')
  await waitForWithTimeoutMessage(
    () => details.waitFor({ state: 'visible', timeout: 5000 }),
    'Expanding the bar on a phone should show the full player.',
  )
  expect(await details.textContent()).to.contain('One Player Demo')
  const buttons = openPanel(page).locator('.preview-player .button-wrapper')
  await buttons.waitFor({ state: 'visible', timeout: 5000 })
  const waveformBox = await openPanel(page)
    .locator('.preview-player .preview-wrapper .waveform_container')
    .boundingBox()
  const buttonsBox = await buttons.boundingBox()
  expect(waveformBox.y + waveformBox.height).to.be.at.most(buttonsBox.y + 1)
  for (const name of [/similar/i, /Follow/, /Ignore/, /Share/]) {
    expect(await buttons.getByRole('button', { name }).first().isVisible()).to.equal(true)
  }
  // The waveform, Preview / Listen, the playback buttons, the button row and the space between them stay put
  const panelSizes = await measure(page, 'panel')
  const close = (a, b, what, within = 2) => expect(Math.abs(a - b), what).to.be.at.most(within)
  close(panelSizes.waveform.height, barSizes.waveform.height, 'waveform height')
  close(panelSizes.waveform.width, barSizes.waveform.width, 'waveform width')
  for (const name of ['preview', 'listen']) {
    close(panelSizes[name].x, barSizes[name].x, `${name} switch x`, 0.5)
    close(panelSizes[name].y - panelSizes.waveform.y, barSizes[name].y - barSizes.waveform.y, `${name} switch y`, 0.5)
  }
  close(panelSizes.play.width, barSizes.play.width, 'play button width')
  close(panelSizes.play.height, barSizes.play.height, 'play button height')
  close(panelSizes.play.x, barSizes.play.x, 'play button position')
  close(panelSizes.next.x, barSizes.next.x, 'next button position')
  close(panelSizes.buttonRow.height, barSizes.buttonRow.height, 'button row height')
  close(panelSizes.gap, barSizes.gap, 'space between the waveform and the buttons')
  expect(panelSizes.previousVisible, 'previous in the panel').to.equal(barSizes.previousVisible)
  // The whole button row fits, share included
  const row = await buttons.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }))
  expect(row.scroll, 'the button row does not overflow').to.be.at.most(row.client)
  const share = await buttons.getByRole('button', { name: /Share/ }).boundingBox()
  expect(share.x + share.width).to.be.at.most(page.viewportSize().width)
  // It sits at the bottom of the screen, in place of the bar
  const panelBox = await openPanel(page).boundingBox()
  expect(Math.abs(panelBox.y + panelBox.height - page.viewportSize().height)).to.be.below(2)
  expect(await page.locator('.docked-player_main').isVisible()).to.equal(false)
  await player.assertStillPlaying(page)
}

// Preview / Listen over the expanded player's waveform switch the audio source
const assertSourceSelectSwitches = ({ page }) =>
  player.assertPreviewListenSwitch(
    page,
    (text) => openPanel(page).locator('.preview-player .preview-wrapper label', { hasText: text }).first(),
    { tap: true },
  )

// The cart button in the expanded player adds the track to the default cart and removes it again
const assertCartButtonToggles = ({ page }) =>
  player.assertCartButtonToggles(
    page,
    '.preview--docked-expanded .preview-player .button-wrapper .button-drop_down-left',
    {
      tap: true,
      where: 'in the expanded player',
    },
  )

// The way back sits in the top right corner of the track details, clear of their text
const assertCollapseButtonInCorner = async ({ page }) => {
  const collapse = page.getByRole('button', { name: 'Back to the player bar' })
  const button = await collapse.boundingBox()
  const details = await openPanel(page).locator('> .preview_details_wrapper').boundingBox()
  expect(Math.abs(button.x + button.width - (details.x + details.width))).to.be.at.most(1)
  expect(Math.abs(button.y - details.y)).to.be.at.most(1)
  const overlapping = await collapse.evaluate((el) => {
    const b = el.getBoundingClientRect()
    const texts = [...document.querySelectorAll('.preview--docked-expanded > .preview_details_wrapper *')].filter(
      (node) =>
        node.offsetParent && [...node.childNodes].some((child) => child.nodeType === 3 && child.textContent.trim()),
    )
    return texts
      .filter((node) => {
        const range = document.createRange()
        range.selectNodeContents(node)
        return [...range.getClientRects()].some(
          (r) => r.right > b.left && r.left < b.right && r.bottom > b.top && r.top < b.bottom,
        )
      })
      .map((node) => node.textContent.trim())
  })
  expect(overlapping, 'text under the collapse button').to.deep.equal([])
}

const assertCollapseReturnsToBar = async ({ page }) => {
  await page.getByRole('button', { name: 'Back to the player bar' }).tap()
  await page.locator('.docked-player_main').waitFor({ state: 'visible', timeout: 5000 })
  expect(await page.locator('.preview--docked > .preview_details_wrapper').isVisible()).to.equal(false)
  await player.assertStillPlaying(page)
}

// A tap on the page behind the expanded player also goes back to the bar
const assertTapOutsideReturnsToBar = async ({ page }) => {
  await toggle(page).tap()
  await openPanel(page).waitFor({ state: 'visible', timeout: 5000 })
  await page.waitForTimeout(800)
  await page.locator('.settings-container h1, .settings-container h2').first().tap()
  await page.locator('.docked-player_main').waitFor({ state: 'visible', timeout: 5000 })
  expect(await openPanel(page).count()).to.equal(0)
  await player.assertStillPlaying(page)
}

// Each step lingers on its result so the demo video can be followed on a phone-sized recording
const lingering = (step) => async (context) => {
  await step(context)
  await context.page.waitForTimeout(1200)
}

module.exports = {
  playAndOpenSettingsOnPhone,
  assertBarWaveformAboveControls: lingering(assertBarWaveformAboveControls),
  assertBarWaveformSeeks: lingering(assertBarWaveformSeeks),
  assertExpandShowsFullPlayer: lingering(assertExpandShowsFullPlayer),
  assertSourceSelectSwitches: lingering(assertSourceSelectSwitches),
  assertCartButtonToggles: lingering(assertCartButtonToggles),
  assertCollapseButtonInCorner: lingering(assertCollapseButtonInCorner),
  assertCollapseReturnsToBar: lingering(assertCollapseReturnsToBar),
  assertTapOutsideReturnsToBar: lingering(assertTapOutsideReturnsToBar),
}

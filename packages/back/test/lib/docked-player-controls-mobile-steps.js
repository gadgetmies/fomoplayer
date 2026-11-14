const { expect } = require('chai')
const { waitForWithTimeoutMessage } = require('./setup')

// Shared browser interactions/assertions for the docked player controls demo on a phone (the touch-enabled Pixel 5
// context). On Settings the docked bar is the waveform, with Preview / Listen on its ends, above play, previous, next and
// the track; expanding it shows the full player the track lists show (details, waveform with Preview / Listen, then the
// controls) with the waveform, buttons and spacing at the same size, and a bar on top or a tap outside goes back. Both entry files import these verbatim; the tracks are seeded through the API.

const toggle = (page) => page.locator('.docked-player .docked-player_expand')
const openPanel = (page) => page.locator('.preview--docked-expanded')

// The bar's and the expanded player's waveform, play button and button row, to compare their sizes
const measure = async (page, scope) => {
  const box = (selector) => page.locator(selector).first().boundingBox()
  const [waveform, play, buttonRow] = await Promise.all(
    scope === 'bar'
      ? [
          box('[data-testid="docked-player-waveform"]'),
          box('.docked-player_row .button-playback'),
          box('.docked-player_row'),
        ]
      : [
          box('.preview--docked-expanded .preview-wrapper .waveform_container'),
          box('.preview--docked-expanded .button-wrapper .button-playback'),
          box('.preview--docked-expanded .button-wrapper'),
        ],
  )
  return { waveform, play, buttonRow, gap: buttonRow.y - (waveform.y + waveform.height) }
}
let barSizes

const audioIsPlaying = (page) =>
  page.waitForFunction(() => document.querySelector('audio')?.paused === false, null, { timeout: 20000 })

const assertStillPlaying = async (page) => {
  expect(await page.$eval('audio', (audio) => audio.paused)).to.equal(false)
}

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
  await waitForWithTimeoutMessage(() => audioIsPlaying(page), 'Tapping a track on the phone should start playing it.')
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
  // The expand button shares the controls' line
  const expand = await toggle(page).boundingBox()
  expect(expand.y).to.be.at.least(controls.y - 1)
  expect(expand.y + expand.height).to.be.at.most(controls.y + controls.height + 1)
  await assertStillPlaying(page)
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
  const buttons = openPanel(page).locator('.button-wrapper')
  await buttons.waitFor({ state: 'visible', timeout: 5000 })
  const waveformBox = await openPanel(page).locator('.preview-wrapper .waveform_container').boundingBox()
  const buttonsBox = await buttons.boundingBox()
  expect(waveformBox.y + waveformBox.height).to.be.at.most(buttonsBox.y + 1)
  for (const name of [/similar/i, /Follow/, /Ignore/, /Share/]) {
    expect(await buttons.getByRole('button', { name }).first().isVisible()).to.equal(true)
  }
  // The waveform, the play button, the button row and the space between them keep their sizes
  const panelSizes = await measure(page, 'panel')
  const close = (a, b, what) => expect(Math.abs(a - b), what).to.be.at.most(2)
  close(panelSizes.waveform.height, barSizes.waveform.height, 'waveform height')
  close(panelSizes.waveform.width, barSizes.waveform.width, 'waveform width')
  close(panelSizes.play.width, barSizes.play.width, 'play button width')
  close(panelSizes.play.height, barSizes.play.height, 'play button height')
  close(panelSizes.buttonRow.height, barSizes.buttonRow.height, 'button row height')
  close(panelSizes.gap, barSizes.gap, 'space between the waveform and the buttons')
  close(panelSizes.play.x, barSizes.play.x, 'play button position')
  // It sits at the bottom of the screen, in place of the bar
  const panelBox = await openPanel(page).boundingBox()
  expect(Math.abs(panelBox.y + panelBox.height - page.viewportSize().height)).to.be.below(2)
  expect(await page.locator('.docked-player_main').isVisible()).to.equal(false)
  await assertStillPlaying(page)
}

// Preview / Listen over the expanded player's waveform switch the audio source
const assertSourceSelectSwitches = async ({ page }) => {
  const label = (text) => openPanel(page).locator('.preview-wrapper label', { hasText: text }).first()
  const initial = await page.evaluate(() => localStorage.getItem('preferFullTracks'))
  await label('Listen').tap()
  expect(await page.evaluate(() => localStorage.getItem('preferFullTracks'))).to.equal('true')
  await page.waitForTimeout(800)
  await label('Preview').tap()
  expect(await page.evaluate(() => localStorage.getItem('preferFullTracks'))).to.equal('false')
  if (initial === 'true') await label('Listen').tap()
}

// The cart button adds the track to the default cart and removes it again (so re-runs start from the same state)
const assertCartButtonToggles = async ({ page }) => {
  const selector = '.preview--docked-expanded .button-wrapper .button-drop_down-left'
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
  await page.locator(selector).tap()
  await waitForWithTimeoutMessage(
    () => waitForTitle(true),
    'The cart button in the expanded player should add the track to (or remove it from) the default cart.',
  )
  await page.waitForTimeout(800)
  await page.locator(selector).tap()
  await waitForTitle(false)
}

const assertCollapseReturnsToBar = async ({ page }) => {
  await page.getByRole('button', { name: 'Back to the player bar' }).tap()
  await page.locator('.docked-player_main').waitFor({ state: 'visible', timeout: 5000 })
  expect(await page.locator('.preview--docked > .preview_details_wrapper').isVisible()).to.equal(false)
  await assertStillPlaying(page)
}

// A tap on the page behind the expanded player also goes back to the bar
const assertTapOutsideReturnsToBar = async ({ page }) => {
  await toggle(page).tap()
  await openPanel(page).waitFor({ state: 'visible', timeout: 5000 })
  await page.waitForTimeout(800)
  await page.locator('.settings-container h1, .settings-container h2').first().tap()
  await page.locator('.docked-player_main').waitFor({ state: 'visible', timeout: 5000 })
  expect(await openPanel(page).count()).to.equal(0)
  await assertStillPlaying(page)
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
  assertCollapseReturnsToBar: lingering(assertCollapseReturnsToBar),
  assertTapOutsideReturnsToBar: lingering(assertTapOutsideReturnsToBar),
}

const { expect } = require('chai')
const { waitForWithTimeoutMessage } = require('./setup')

// Browser steps for the player's controls, shared by the demos that exercise them in different places (the docked bar
// on wider screens, the expanded player on phones). Each takes where the control is and whether to click or tap it.

const press = (locator, { tap = false } = {}) => (tap ? locator.tap() : locator.click())

const audioIsPlaying = (page) =>
  page.waitForFunction(() => document.querySelector('audio')?.paused === false, null, { timeout: 20000 })

const assertStillPlaying = async (page) => {
  expect(await page.$eval('audio', (audio) => audio.paused)).to.equal(false)
}

// The cart button adds the track to the default cart and removes it again (so re-runs start from the same state)
const assertCartButtonToggles = async (page, selector, { tap = false, where } = {}) => {
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
  await press(page.locator(selector), { tap })
  await waitForWithTimeoutMessage(
    () => waitForTitle(true),
    `The cart button ${where} should add the track to (or remove it from) the default cart.`,
  )
  await page.waitForTimeout(800)
  await press(page.locator(selector), { tap })
  await waitForTitle(false)
}

// Preview / Listen switch the audio source (the preferFullTracks setting), and are left as they were found. label(text)
// finds the switch.
const assertPreviewListenSwitch = async (page, label, { tap = false } = {}) => {
  const preferFullTracks = () => page.evaluate(() => localStorage.getItem('preferFullTracks'))
  const initial = await preferFullTracks()
  await press(label('Listen'), { tap })
  expect(await preferFullTracks()).to.equal('true')
  await page.waitForTimeout(800)
  await press(label('Preview'), { tap })
  expect(await preferFullTracks()).to.equal('false')
  if (initial === 'true') await press(label('Listen'), { tap })
}

module.exports = { audioIsPlaying, assertStillPlaying, assertCartButtonToggles, assertPreviewListenSwitch }

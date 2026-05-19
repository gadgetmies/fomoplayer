const { expect } = require('chai')
const { test } = require('cascade-test')
const { getSharedContext, dismissOnboarding, waitForWithTimeoutMessage } = require('../lib/setup')

const SLIDER_SELECTOR = 'input[type="range"][id^="weights-"]'

test({
  setup: async () => {
    const { page } = await getSharedContext()
    await page.goto('/settings/sorting')
    await waitForWithTimeoutMessage(
      () => page.waitForSelector('.settings-container', { timeout: 15000 }),
      'Render the settings container before exercising score-weight sliders.',
    )
    await dismissOnboarding(page)
    await waitForWithTimeoutMessage(
      () => page.waitForSelector(SLIDER_SELECTOR, { timeout: 15000 }),
      'Render the score-weight slider inputs before exercising them.',
    )
    return { page, timeout: 30000 }
  },

  'dragging a score-weight slider updates the value and the filled-track width': async ({ page }) => {
    await page.goto('/settings/sorting')
    await waitForWithTimeoutMessage(
      () => page.waitForSelector(SLIDER_SELECTOR, { timeout: 15000 }),
      'Render the score-weight slider inputs before exercising them.',
    )

    const slider = page.locator(SLIDER_SELECTOR).first()
    await waitForWithTimeoutMessage(
      () => slider.waitFor({ state: 'visible', timeout: 15000 }),
      'Reveal the first score-weight slider before interacting with it.',
    )

    const initial = await slider.evaluate((el) => ({
      value: el.value,
      backgroundSize: getComputedStyle(el).backgroundSize,
    }))

    await slider.focus()
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('ArrowRight')
    }

    const sliderBox = await slider.boundingBox()
    if (sliderBox) {
      const startX = sliderBox.x + sliderBox.width * 0.5
      const y = sliderBox.y + sliderBox.height / 2
      const endX = sliderBox.x + sliderBox.width * 0.85
      await page.mouse.move(startX, y)
      await page.mouse.down()
      await page.mouse.move(endX, y, { steps: 20 })
      await page.mouse.up()
    }

    const after = await slider.evaluate((el) => ({
      value: el.value,
      backgroundSize: getComputedStyle(el).backgroundSize,
    }))

    expect(after.value, 'slider value moved after keyboard/drag input').to.not.equal(initial.value)
    expect(after.backgroundSize, 'filled-track width responded to value change').to.not.equal(initial.backgroundSize)
  },
})

const { expect } = require('chai')
const { test } = require('cascade-test')
const { getSharedContext, waitForWithTimeoutMessage } = require('../lib/setup')
const { seedRadiatorMockData, radiatorPresetNames } = require('../lib/radiator-mock')

const LOAD_SELECT = '#admin-radiator-load'

test({
  setup: async () => {
    const { page } = await getSharedContext()
    await seedRadiatorMockData()
    await page.goto('/admin')
    await waitForWithTimeoutMessage(
      () => page.waitForSelector(LOAD_SELECT, { timeout: 15000 }),
      'Render the Radiator admin view (the "Load radiator" select) after navigating to /admin.',
    )
    return { page, timeout: 30000 }
  },

  'seeded radiator presets are listed and render chart data when selected': async ({ page }) => {
    const presetName = radiatorPresetNames[0]

    // The presets are only listed if GET /api/admin/radiator/config returned
    // them, which requires the logged-in test user to be an admin.
    await waitForWithTimeoutMessage(
      () =>
        page.waitForFunction(
          (name) =>
            Array.from(document.querySelectorAll('#admin-radiator-load option')).some(
              (o) => o.textContent.trim() === name,
            ),
          presetName,
          { timeout: 15000 },
        ),
      `Expose the seeded "${presetName}" preset in the Load radiator dropdown.`,
    )

    await page.selectOption(LOAD_SELECT, { label: presetName })

    // Bring the rendered chart into view so it is the focus of the recording.
    await page
      .locator('canvas')
      .first()
      .scrollIntoViewIfNeeded({ timeout: 5000 })
      .catch(() => {})

    // Reveal the collected-data panel and assert the lens produced
    // {time,label,value} triples from the seeded job results.
    await page.locator('.admin-section-toggle', { hasText: 'Collected data' }).first().click()
    const collected = page.locator('.admin-field textarea[disabled]').last()
    await waitForWithTimeoutMessage(
      () =>
        page.waitForFunction(
          () => {
            const areas = Array.from(document.querySelectorAll('.admin-field textarea[disabled]'))
            return areas.some((a) => /"label"/.test(a.value) && /"value"/.test(a.value))
          },
          undefined,
          { timeout: 15000 },
        ),
      'Populate the collected-data panel with {label,value} entries after selecting the preset.',
    )

    const collectedText = await collected.inputValue()
    const parsed = JSON.parse(collectedText)
    expect(parsed, 'collected data should be a non-empty array of points').to.be.an('array').that.is.not.empty
    expect(parsed[0]).to.include.keys(['time', 'label', 'value'])
    const labels = parsed.map((p) => p.label)
    expect(labels.some((l) => l === 'Beatport' || l === 'Bandcamp')).to.equal(true)
  },
})

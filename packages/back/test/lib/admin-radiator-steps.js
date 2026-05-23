// Browser steps shared by the local and preview admin Radiator demo tests.
// Both navigate to /admin, pick the seeded preset so the chart renders, and
// assert the radiator has the seeded "added tracks by store" data. The setup
// (how the data gets seeded) differs per environment; these steps do not.

const { expect } = require('chai')
const { waitForWithTimeoutMessage } = require('./setup')
const { radiatorPresetNames, ADDED_TRACKS_JOB } = require('./radiator-mock')

const LOAD_SELECT = '#admin-radiator-load'
const PRESET_NAME = radiatorPresetNames[0]

const gotoRadiator = async (page) => {
  await page.goto('/admin')
  await waitForWithTimeoutMessage(
    () => page.waitForSelector(LOAD_SELECT, { timeout: 15000 }),
    'Render the Radiator admin view (the "Load radiator" select) after navigating to /admin.',
  )
}

const assertRadiatorShowsSeededData = async ({ page }) => {
  // The preset only appears if GET /api/admin/radiator/config returned it,
  // which requires the session user to be an admin in this environment.
  await waitForWithTimeoutMessage(
    () =>
      page.waitForFunction(
        (name) =>
          Array.from(document.querySelectorAll('#admin-radiator-load option')).some((o) => o.textContent.trim() === name),
        PRESET_NAME,
        { timeout: 15000 },
      ),
    `Expose the seeded "${PRESET_NAME}" preset in the Load radiator dropdown.`,
  )

  // Selecting the preset drives updateChart(), rendering the bar chart.
  await page.selectOption(LOAD_SELECT, { label: PRESET_NAME })
  await page
    .locator('.admin-page-chart canvas')
    .first()
    .scrollIntoViewIfNeeded({ timeout: 5000 })
    .catch(() => {})

  // Best-effort: open the data panels so the recording shows the values.
  for (const section of ['Chart data', 'Collected data']) {
    await page
      .locator('.admin-section-toggle', { hasText: section })
      .first()
      .click({ timeout: 5000 })
      .catch(() => {})
  }

  // Hard assertion against the same endpoint the view reads: the radiator has
  // the seeded job results. page.request carries the logged-in session cookie.
  const res = await page.request.get('/api/admin/radiator')
  expect(res.ok(), `GET /api/admin/radiator returned HTTP ${res.status()}`).to.equal(true)
  const data = await res.json()
  const added = data.find((d) => d.job_name === ADDED_TRACKS_JOB)
  expect(added, `radiator results include ${ADDED_TRACKS_JOB}`).to.exist
  const latest = added.results[0]
  expect(latest.success, 'latest added-tracks-by-store run succeeded').to.equal(true)
  const rows = latest.result || []
  expect(rows, 'added-tracks-by-store result rows').to.be.an('array').that.is.not.empty
  expect(
    rows.some((r) => Number(r.count) > 0 && typeof r.store_name === 'string' && r.store_name.length > 0),
    'a store has at least one added track',
  ).to.equal(true)
}

module.exports = { gotoRadiator, assertRadiatorShowsSeededData, LOAD_SELECT, PRESET_NAME }

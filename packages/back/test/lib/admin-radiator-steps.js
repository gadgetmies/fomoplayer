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
          Array.from(document.querySelectorAll('#admin-radiator-load option')).some(
            (o) => o.textContent.trim() === name,
          ),
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

  // The preset's lens collects a value per store for the chart. It uses lens functions the view itself does not, which
  // production builds (the tests use one) only keep when the view hands the whole library to the lens.
  await page.locator('.admin-section-toggle', { hasText: 'Chart data' }).first().click({ timeout: 5000 })
  await waitForWithTimeoutMessage(
    () =>
      page.waitForFunction(
        () => {
          const box = document.querySelector('.admin-page-chart ~ .admin-field textarea')
          return box && !box.classList.contains('error') && JSON.parse(box.value).datasets.length > 0
        },
        null,
        { timeout: 15000 },
      ),
    'Draw the chart from the preset lens (the Chart data box has datasets and no error).',
  )

  // Best-effort: open the collected data so the recording shows the values.
  for (const section of ['Collected data']) {
    await page
      .locator('.admin-section-toggle', { hasText: section })
      .first()
      .click({ timeout: 5000 })
      .catch(() => {})
  }

  // The Data section summarises each radiator query instead of printing a week of results into a text box, which froze
  // the view once the runs held many rows.
  await page
    .locator('.admin-section-toggle', { hasText: /^Data$/ })
    .first()
    .click({ timeout: 5000 })
  const addedRow = page.locator('.admin-radiator-data-table tr', { hasText: ADDED_TRACKS_JOB })
  await waitForWithTimeoutMessage(
    () => addedRow.first().waitFor({ timeout: 15000 }),
    `Summarise the ${ADDED_TRACKS_JOB} runs in the Data section's table.`,
  )
  expect(await addedRow.first().textContent(), 'the latest run is shown as successful').to.contain('Success')
  expect(
    await page.locator('.admin-radiator-data button', { hasText: 'Download JSON' }).isEnabled(),
    'the full data can be downloaded',
  ).to.equal(true)
  await addedRow
    .first()
    .scrollIntoViewIfNeeded({ timeout: 5000 })
    .catch(() => {})

  // Hard assertion against the same endpoint the view reads. Use a browser-side
  // fetch (not page.request) so it goes through the browser network with the
  // logged-in session cookie, bypassing the Node-process http interceptors.
  const fetched = await page.evaluate(async () => {
    const r = await fetch('/api/admin/radiator', { credentials: 'same-origin' })
    return { status: r.status, body: r.ok ? await r.json() : await r.text() }
  })
  expect(
    fetched.status,
    `GET /api/admin/radiator returned HTTP ${fetched.status}: ${typeof fetched.body === 'string' ? fetched.body : ''}`,
  ).to.equal(200)
  const data = fetched.body
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

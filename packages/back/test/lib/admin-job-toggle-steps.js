// Browser steps shared by the local and preview admin job toggle demo tests. Neither needs seeded state: the
// updateJobs job is inserted by the first job-scheduling migration, so it exists in every environment.
//
// The case flips the job's enabled state and then flips it back, so it leaves the environment as it found it
// whichever state the job started in.

const { dismissOnboarding, waitForWithTimeoutMessage } = require('./setup')

const JOB = 'updateJobs'

const gotoJobs = async (page) => {
  await page.goto('/admin/jobs')
  await waitForWithTimeoutMessage(
    () => page.getByRole('heading', { level: 1, name: 'Jobs', exact: true }).waitFor({ timeout: 15000 }),
    'Render the Jobs admin page heading at /admin/jobs.',
  )
  // A fresh user with no tracks gets the onboarding tour on every full page load; its overlay blocks clicks.
  await dismissOnboarding(page)
}

const jobRow = (page) => page.getByRole('row').filter({ has: page.getByRole('cell', { name: JOB, exact: true }) })

// ToggleButton hides its checkbox and draws a slider: read the state from the checkbox, click the visible slider.
const toggleInput = (page) => page.locator(`#admin-job-enabled-${JOB}`)
const toggleSlider = (page) => jobRow(page).locator('.toggle-button')

const isEnabled = (page) => toggleInput(page).isChecked()

const expectState = async (page, enabled) => {
  await waitForWithTimeoutMessage(
    () =>
      page.waitForFunction(
        ({ selector, enabled }) => {
          const input = document.querySelector(selector)
          return input && input.checked === enabled && !input.disabled
        },
        { selector: `#admin-job-enabled-${JOB}`, enabled },
        { timeout: 10000 },
      ),
    `Show the ${JOB} job toggle ${enabled ? 'on' : 'off'} and usable again after saving the change.`,
  )
}

const cases = {
  'an admin disables and re-enables a job from the Jobs page': async ({ page }) => {
    await waitForWithTimeoutMessage(
      () => jobRow(page).waitFor({ timeout: 15000 }),
      `List the ${JOB} job on the Jobs admin page.`,
    )
    const startedEnabled = await isEnabled(page)

    await toggleSlider(page).click()
    await expectState(page, !startedEnabled)

    // The change is stored, not just shown: it survives a reload.
    await gotoJobs(page)
    await expectState(page, !startedEnabled)

    await toggleSlider(page).click()
    await expectState(page, startedEnabled)
  },
}

module.exports = { gotoJobs, cases }

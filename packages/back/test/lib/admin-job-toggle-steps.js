// Browser steps shared by the local and preview admin job toggle demo tests. Neither needs seeded state: the
// updateJobs job is inserted by the first job-scheduling migration, so it exists in every environment.
//
// The case flips the job's enabled state and then flips it back, so it leaves the environment as it found it
// whichever state the job started in.

const { expect } = require('chai')
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

const enabledCell = (page) => jobRow(page).getByRole('cell').nth(2)

const toggleButton = (page) => jobRow(page).getByRole('button', { name: new RegExp(`^(Enable|Disable) ${JOB}$`) })

const expectState = async (page, enabled) => {
  await waitForWithTimeoutMessage(
    () =>
      toggleButton(page)
        .and(page.getByRole('button', { name: `${enabled ? 'Disable' : 'Enable'} ${JOB}`, exact: true }))
        .waitFor({ timeout: 10000 }),
    `Show the ${JOB} job as ${enabled ? 'enabled' : 'disabled'} after toggling it.`,
  )
  expect(await enabledCell(page).textContent()).to.equal(enabled ? 'Yes' : 'No')
  expect(await toggleButton(page).isEnabled(), 'the toggle is usable again once the change is saved').to.equal(true)
}

const cases = {
  'an admin disables and re-enables a job from the Jobs page': async ({ page }) => {
    await waitForWithTimeoutMessage(
      () => jobRow(page).waitFor({ timeout: 15000 }),
      `List the ${JOB} job on the Jobs admin page.`,
    )
    const startedEnabled = (await enabledCell(page).textContent()) === 'Yes'

    await toggleButton(page).click()
    await expectState(page, !startedEnabled)

    // The change is stored, not just shown: it survives a reload.
    await gotoJobs(page)
    await expectState(page, !startedEnabled)

    await toggleButton(page).click()
    await expectState(page, startedEnabled)
  },
}

module.exports = { gotoJobs, cases }

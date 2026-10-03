// Browser steps shared by the local and preview guided tour demo tests. They walk the start of
// the onboarding tutorial (opened from the Support menu, advanced both by Next and by the app
// itself when the user clicks the highlighted Settings button) and the Settings help tour
// (beacon, Next, Back, close, reopen). Both tours are rendered by react-joyride.

const { expect } = require('chai')
const { waitForWithTimeoutMessage } = require('./setup')

const tooltip = (page) => page.locator('.react-joyride__tooltip')
const primaryButton = (page) => tooltip(page).locator('[data-action=primary]')

const waitForTooltipText = (page, text, message) =>
  waitForWithTimeoutMessage(() => tooltip(page).getByText(text).waitFor({ timeout: 10000 }), message)

const walkOnboarding = async ({ page }) => {
  await page.goto('/tracks/recent')
  await page.click('[data-onboarding-id=support-button]')
  await page.getByText('Show Tutorial').click()

  await waitForTooltipText(page, 'Welcome to the Fomo Player', 'Open the onboarding tutorial from the Support menu.')
  expect(await tooltip(page).locator('[data-action=skip]').textContent()).to.equal(
    "Thanks, but I'll find my own way around",
  )
  expect(await primaryButton(page).textContent()).to.equal('Next (Step 1 of 13)')

  await primaryButton(page).click()
  await waitForTooltipText(page, 'click the Settings button', 'Advance to the step that points at the Settings button.')
  // This step can only be completed by doing what it asks, so its Next button is disabled.
  expect(await primaryButton(page).isDisabled()).to.equal(true)

  await page.click('[data-onboarding-id=settings-button]')
  await waitForTooltipText(
    page,
    'Input the name of an artist',
    'Advance the tutorial automatically once the Settings button is clicked.',
  )

  await tooltip(page).locator('[data-action=close]').click()
  await waitForWithTimeoutMessage(
    () => tooltip(page).waitFor({ state: 'detached', timeout: 5000 }),
    'Close the tutorial from its close button.',
  )
}

const walkSettingsHelp = async ({ page }) => {
  await page.goto('/settings')
  await page.click('[data-onboarding-id=help-button]')
  await waitForWithTimeoutMessage(
    () => page.locator('.react-joyride__beacon').waitFor({ timeout: 10000 }),
    'Show the help beacon on the Following tab after clicking the Settings help button.',
  )
  await page.click('.react-joyride__beacon')
  await waitForTooltipText(page, 'In the Following tab', 'Open the first Settings help step from the beacon.')
  expect(await primaryButton(page).textContent()).to.equal('Next (Step 1 of 8)')

  await primaryButton(page).click()
  await waitForTooltipText(page, 'You can collect interesting tracks', 'Advance to the Carts help step.')
  await tooltip(page).locator('[data-action=back]').click()
  await waitForTooltipText(page, 'In the Following tab', 'Go back to the Following help step.')

  await tooltip(page).locator('[data-action=close]').click()
  await waitForWithTimeoutMessage(
    () => tooltip(page).waitFor({ state: 'detached', timeout: 5000 }),
    'Close the Settings help.',
  )

  await page.click('[data-onboarding-id=help-button]')
  await waitForWithTimeoutMessage(
    () => page.locator('.react-joyride__beacon').waitFor({ timeout: 10000 }),
    'Reopen the Settings help after closing it.',
  )
}

module.exports = { walkOnboarding, walkSettingsHelp }

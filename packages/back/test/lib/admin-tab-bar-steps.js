// Browser steps shared by the local and preview admin tab bar demo tests. Neither needs seeded state: the admin
// pages render their headings and navigation without data.
//
// `cases` walk the admin pages through the tab bar. `casesBeforeChange` record the same tour on the old
// hub-and-spoke navigation (a row of tool buttons on the Radiator page and a "Back to Radiator" button on every
// tool); they only run in the before recording, against the code without the tab bar (see demo-test.js).

const { expect } = require('chai')
const { dismissOnboarding, waitForWithTimeoutMessage } = require('./setup')

const PAGES = [
  { tab: 'Radiator', path: '/admin', heading: 'Radiator' },
  { tab: 'Jobs', path: '/admin/jobs', heading: 'Jobs', hubButton: 'Jobs' },
  { tab: 'Duplicates', path: '/admin/duplicates', heading: 'Suspected Duplicates', hubButton: 'Manage Duplicates' },
  {
    tab: 'Mislabeled',
    path: '/admin/mislabeled',
    heading: 'Mislabeled Artists & Labels',
    hubButton: 'Fix Mislabeled',
  },
  { tab: 'Artist split', path: '/admin/artist-split', heading: 'Split Combined Artists', hubButton: 'Split Artists' },
]
const RADIATOR = PAGES[0]
const TOOLS = PAGES.slice(1)

const expectHeading = async (page, { heading, path }) => {
  await waitForWithTimeoutMessage(
    () => page.getByRole('heading', { level: 1, name: heading, exact: true }).waitFor({ timeout: 15000 }),
    `Render the "${heading}" admin page heading at ${path}.`,
  )
  expect(new URL(page.url()).pathname).to.equal(path)
}

// A fresh user with no tracks gets the onboarding tour on every full page load; its overlay blocks clicks.
const goto = async (page, target) => {
  await page.goto(target.path)
  await expectHeading(page, target)
  await dismissOnboarding(page)
}

const gotoAdmin = (page) => goto(page, RADIATOR)

const adminTabs = (page) => page.getByRole('navigation', { name: 'Admin' })

const cases = {
  'the tab bar moves straight between the admin pages': async ({ page }) => {
    for (const target of [...TOOLS, RADIATOR]) {
      const tab = adminTabs(page).getByRole('link', { name: target.tab, exact: true })
      await tab.click()
      await expectHeading(page, target)
      expect(await tab.getAttribute('aria-current'), `the ${target.tab} tab is the selected one`).to.equal('page')
      expect(
        await adminTabs(page).locator('[aria-current="page"]').count(),
        'exactly one admin tab is selected',
      ).to.equal(1)
    }
  },
  'no admin page shows the old hub buttons': async ({ page }) => {
    for (const target of PAGES) {
      await goto(page, target)
      await adminTabs(page).waitFor({ timeout: 5000 })
      expect(await page.getByRole('button', { name: 'Back to Radiator' }).count()).to.equal(0)
      for (const { hubButton } of TOOLS) {
        expect(await page.getByRole('button', { name: hubButton, exact: true }).count()).to.equal(0)
      }
    }
  },
}

const casesBeforeChange = {
  'each tool is reached through the Radiator page': async ({ page }) => {
    for (const target of TOOLS) {
      await page.getByRole('button', { name: target.hubButton, exact: true }).click()
      await expectHeading(page, target)
      await page.getByRole('button', { name: 'Back to Radiator' }).click()
      await expectHeading(page, RADIATOR)
    }
  },
}

module.exports = { gotoAdmin, cases, casesBeforeChange }

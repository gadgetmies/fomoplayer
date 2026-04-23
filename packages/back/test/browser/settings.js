const { expect } = require('chai')
const { test } = require('cascade-test')
const { getSharedContext, dismissOnboarding, waitForWithTimeoutMessage } = require('../lib/setup')
const { seedTracks } = require('../lib/seed')
const { seededTrackAssertions } = require('../lib/seed')
const { resolveTestUserId } = require('../lib/test-user')

test({
  setup: async () => {
    const { page } = await getSharedContext()
    const userId = await resolveTestUserId()
    await seedTracks({ userIds: [userId] })
    await page.goto('/settings')
    await waitForWithTimeoutMessage(
      () => page.waitForSelector('.settings-container', { timeout: 15000 }),
      'Render the settings container before validating settings controls.',
    )
    await dismissOnboarding(page)
    return { page, timeout: 30000 }
  },

  'settings page is accessible': async ({ page }) => {
    await page.goto('/settings')
    await waitForWithTimeoutMessage(
      () => page.waitForSelector('.settings-container', { timeout: 15000 }),
      'Render settings container before checking page accessibility.',
    )
    expect(await page.locator('.settings-container').count()).to.be.greaterThan(0)
  },

  'settings page has store selection buttons': async ({ page }) => {
    await page.goto('/settings')
    await waitForWithTimeoutMessage(
      () => page.waitForSelector('.settings-container', { timeout: 15000 }),
      'Render settings container before checking store selection controls.',
    )
    expect(await page.locator('.select-button--container').count()).to.be.greaterThan(0)
  },

  'can navigate back to track list': async ({ page }) => {
    await page.goto('/tracks/recent')
    await waitForWithTimeoutMessage(
      () => page.waitForSelector('.tracks-table', { timeout: 15000 }),
      'Load the tracks table after navigating back from settings.',
    )
    const trackTitles = await page.locator('.track .title-cell').allTextContents()
    expect(trackTitles.map((t) => t.trim())).to.include.members(seededTrackAssertions.titles)
  },
})

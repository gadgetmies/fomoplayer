const { expect } = require('chai')
const { test } = require('cascade-test')
const { getSharedContext, dismissOnboarding } = require('../lib/setup')
const { seedTracks } = require('../lib/seed')
const { seededTrackAssertions } = require('../lib/seed')
const { resolveTestUserId } = require('../lib/test-user')

test({
  setup: async () => {
    const { page } = await getSharedContext()
    const userId = await resolveTestUserId()
    await seedTracks({ userIds: [userId] })
    await page.goto('/settings')
    await page.waitForSelector('.settings-container', { timeout: 15000 })
    await dismissOnboarding(page)
    return { page, timeout: 30000 }
  },

  'settings page is accessible': async ({ page }) => {
    expect(await page.locator('.settings-container').count()).to.be.greaterThan(0)
  },

  'settings page has store selection buttons': async ({ page }) => {
    expect(await page.locator('.select-button--container').count()).to.be.greaterThan(0)
  },

  'can navigate back to track list': async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.tracks-table', { timeout: 15000 })
    const trackTitles = await page.locator('.track .title-cell').allTextContents()
    expect(trackTitles.map((t) => t.trim())).to.include.members(seededTrackAssertions.titles)
  },
})

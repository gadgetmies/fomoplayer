const { expect } = require('chai')
const { test } = require('cascade-test')
const { getSharedContext, dismissOnboarding } = require('../lib/setup')
const { seedTracks, seededTrackAssertions } = require('../lib/seed')
const { resolveTestUserId } = require('../lib/test-user')

test({
  setup: async () => {
    const { page } = await getSharedContext()
    const userId = await resolveTestUserId()
    await seedTracks({ userIds: [userId] })
    await page.reload()
    await page.waitForSelector('.tracks-table', { timeout: 1000 })
    await dismissOnboarding(page)
    return { page, timeout: 3000}
  },

  'track list contains seeded rows': async ({ page }) => {
    const trackTitles = await page.locator('.track .title-cell').allTextContents()
    expect(trackTitles.map((t) => t.trim())).to.include.members(seededTrackAssertions.titles)
  },

  'seeded rows show the expected artist': async ({ page }) => {
    const artists = await page.locator('.track .artist-cell').allTextContents()
    expect(artists.map((t) => t.trim())).to.include.members(seededTrackAssertions.artists)
  },

  'mark-heard button is present on each track': async ({ page }) => {
    expect(await page.locator('.track-mark-heard-button').count()).to.equal(
      await page.locator('.track').count(),
    )
  },
})

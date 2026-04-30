const { expect } = require('chai')
const { test } = require('cascade-test')
const { getSharedContext, dismissOnboarding, waitForWithTimeoutMessage } = require('../lib/setup')
const { seedTracks, seededTrackAssertions } = require('../lib/seed')
const { resolveTestUserId } = require('../lib/test-user')

test({
  setup: async () => {
    const { page } = await getSharedContext()
    const userId = await resolveTestUserId()
    await seedTracks({ userIds: [userId] })
    await page.reload()
    await waitForWithTimeoutMessage(
      () => page.waitForSelector('.tracks-table', { timeout: 5000 }),
      'Load the tracks table after reload so browsing assertions run on rendered rows.',
    )
    await dismissOnboarding(page)
    return { page, timeout: 3000}
  },

  'track list contains seeded rows': async ({ page }) => {
    await page.goto('/tracks/recent')
    await waitForWithTimeoutMessage(
      () => page.waitForSelector('.tracks-table', { timeout: 1000 }),
      'Load the tracks table before asserting seeded track titles.',
    )
    const trackTitles = await page.locator('.track .title-cell').allTextContents()
    expect(trackTitles.map((t) => t.trim())).to.include.members(seededTrackAssertions.titles)
  },

  'seeded rows show the expected artist': async ({ page }) => {
    await page.goto('/tracks/recent')
    await waitForWithTimeoutMessage(
      () => page.waitForSelector('.tracks-table', { timeout: 1000 }),
      'Load the tracks table before asserting seeded artists.',
    )
    const cellTexts = await page.locator('.track .artist-cell').allTextContents()
    const artistNames = Array.from(
      new Set(
        cellTexts
          .flatMap((cell) => cell.split(/,| & /))
          .map((name) => name.trim())
          .filter((name) => name.length > 0),
      ),
    )
    expect(artistNames).to.include.members(seededTrackAssertions.artists)
  },

  'mark-heard button is present on each track': async ({ page }) => {
    await page.goto('/tracks/recent')
    await waitForWithTimeoutMessage(
      () => page.waitForSelector('.tracks-table', { timeout: 1000 }),
      'Load the tracks table before asserting mark-heard controls.',
    )
    expect(await page.locator('.track-mark-heard-button').count()).to.equal(
      await page.locator('.track').count(),
    )
  },
})

const { expect } = require('chai')
const { test } = require('cascade-test')
const { getSharedContext, dismissOnboarding } = require('../lib/setup')
const { seedTracks } = require('../lib/seed')
const { resolveTestUserId } = require('../lib/test-user')

test({
  setup: async () => {
    const { page } = await getSharedContext()
    const userId = await resolveTestUserId()
    await seedTracks({ userIds: [userId] })
    await page.goto('/')
    await page.waitForSelector('.tracks-table', { timeout: 15000 })
    await dismissOnboarding(page)
    await page.locator('.track').first().click()
    return { page, timeout: 30000 }
  },

  'clicking a track selects it': async ({ page }) => {
    await page.locator('.track').first().click()
    expect(await page.locator('.track.selected').count()).to.equal(1)
  },

  'play button is visible': async ({ page }) => {
    expect(await page.locator('.button-playback').first().isVisible()).to.be.true
  },

  'clicking play changes icon to pause': async ({ page }) => {
    await page.locator('.track').first().click()
    await page.locator('.button-playback').first().click()
    await page.locator('.button-playback svg[data-icon="pause"]').first().waitFor({ timeout: 5000 })
    expect(await page.locator('.button-playback svg[data-icon="pause"]').count()).to.be.greaterThan(0)
  },

  'clicking pause restores play icon': async ({ page }) => {
    await page.locator('.track').first().click()
    const btn = page.locator('.button-playback').first()
    const pauseIcon = page.locator('.button-playback svg[data-icon="pause"]').first()
    const playIcon = page.locator('.button-playback svg[data-icon="play"]').first()
    if (await pauseIcon.isVisible()) {
      await btn.click()
      await playIcon.waitFor({ timeout: 5000 })
    }
    await btn.click()
    await pauseIcon.waitFor({ timeout: 5000 })
    await btn.click()
    await playIcon.waitFor({ timeout: 5000 })
    expect(await page.locator('.button-playback svg[data-icon="play"]').count()).to.be.greaterThan(0)
  },
})

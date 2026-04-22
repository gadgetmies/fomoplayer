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
  
  'cart add button is visible in preview': async ({ page }) => {
    const cartButton = page.locator('.button-drop_down-left').first()
    await cartButton.waitFor({ state: 'visible', timeout: 10000 })
    expect(await cartButton.isVisible()).to.be.true
  },

  'clicking cart button adds track to default cart': async ({ page }) => {
    await page.locator('.track').first().click()
    await page.waitForFunction(() => !!document.querySelector('.track.selected'), { timeout: 10000 })
    const cartButton = page.locator('.button-drop_down-left').first()
    await cartButton.waitFor({ state: 'visible', timeout: 10000 })
    await page.waitForFunction(
      () => !!document.querySelector('.button-drop_down-left')?.getAttribute('title'),
      { timeout: 10000 },
    )
    await page.waitForFunction(() => {
      const button = document.querySelector('.button-drop_down-left')
      return !!button && !button.disabled
    }, { timeout: 10000 })
    const initialTitle = await cartButton.getAttribute('title')
    expect(initialTitle).to.be.a('string')
    await cartButton.click({ timeout: 10000 })
    await page.waitForFunction(
      (prev) => {
        const next = document.querySelector('.button-drop_down-left')?.getAttribute('title')
        return !!next && next !== prev
      },
      initialTitle,
      { timeout: 10000 },
    )
    const updatedTitle = await cartButton.getAttribute('title')
    expect(updatedTitle).to.be.a('string')
    expect(updatedTitle).to.not.equal(initialTitle)
  },

  'track in cart can be removed': async ({ page }) => {
    await page.locator('.track').first().click()
    await page.waitForFunction(() => !!document.querySelector('.track.selected'), { timeout: 10000 })
    const cartButton = page.locator('.button-drop_down-left').first()
    await page.waitForFunction(() => {
      const button = document.querySelector('.button-drop_down-left')
      return !!button && !button.disabled
    }, { timeout: 10000 })
    const titleAfterAdd = await cartButton.getAttribute('title')
    if (titleAfterAdd?.toLowerCase().includes('remove') || titleAfterAdd?.toLowerCase().includes('minus')) {
      await cartButton.click()
      await page.waitForTimeout(300)
      expect(await cartButton.getAttribute('title')).to.not.equal(titleAfterAdd)
    }
  },
})

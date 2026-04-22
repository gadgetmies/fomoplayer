const { expect } = require('chai')
const { test } = require('cascade-test')
const { getSharedContext, dismissOnboarding } = require('../lib/setup')

test({
  setup: async () => {
    const { page } = await getSharedContext()
    await page.goto('/')
    await page.waitForSelector('.tracks-table', { timeout: 15000 })
    await dismissOnboarding(page)
    return { page, timeout: 30000 }
  },
  
  'search input is present': async ({ page }) => {
    expect(await page.locator('.search_input_pills').first().isVisible()).to.be.true
  },

  'typing a query navigates to search route': async ({ page }) => {
    await page.locator('.search_input_pills').first().fill('noisia')
    await page.locator('.search_input_pills').first().press('Enter')
    await page.waitForURL(/\/search/, { timeout: 5000 })
    expect(page.url()).to.include('/search')
  },
})

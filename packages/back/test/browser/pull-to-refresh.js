const { expect } = require('chai')
const { test } = require('cascade-test')
const { getSharedContext, dismissOnboarding, waitForWithTimeoutMessage } = require('../lib/setup')
const { seedTracks } = require('../lib/seed')
const { resolveTestUserId } = require('../lib/test-user')

const dispatchTouch = async (page, type, clientY) =>
  page.evaluate(
    ({ type, clientY }) => {
      const tbody = document.querySelector('.tracks-table tbody')
      if (!tbody) throw new Error('tracks tbody not found')
      const rect = tbody.getBoundingClientRect()
      const clientX = Math.floor(rect.left + rect.width / 2)
      const touch = new Touch({
        identifier: 1,
        target: tbody,
        clientX,
        clientY,
        pageX: clientX,
        pageY: clientY,
      })
      const list = type === 'touchend' ? [] : [touch]
      const event = new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        touches: list,
        targetTouches: list,
        changedTouches: [touch],
      })
      tbody.dispatchEvent(event)
    },
    { type, clientY },
  )

test({
  setup: async () => {
    const { page } = await getSharedContext()
    const userId = await resolveTestUserId()
    await seedTracks({ userIds: [userId] })
    await page.goto('/tracks/recent')
    await waitForWithTimeoutMessage(
      () => page.waitForSelector('.tracks-table', { timeout: 15000 }),
      'Load the tracks table before exercising pull-to-refresh.',
    )
    await dismissOnboarding(page)
    await page.evaluate(() => {
      const tbody = document.querySelector('.tracks-table tbody')
      if (tbody) tbody.scrollTop = 0
    })
    return { page, timeout: 30000 }
  },

  'pull down past threshold triggers a refresh': async ({ page }) => {
    const startY = 120

    await dispatchTouch(page, 'touchstart', startY)

    for (const offset of [10, 30, 60, 90]) {
      await dispatchTouch(page, 'touchmove', startY + offset)
      await page.waitForTimeout(150)
    }
    await waitForWithTimeoutMessage(
      () => page.locator('text=Pull down to refresh').waitFor({ state: 'visible', timeout: 3000 }),
      '"Pull down to refresh" should be visible while pulling below the threshold.',
    )

    for (const offset of [120, 150, 180]) {
      await dispatchTouch(page, 'touchmove', startY + offset)
      await page.waitForTimeout(150)
    }
    await waitForWithTimeoutMessage(
      () => page.locator('text=Release to refresh').waitFor({ state: 'visible', timeout: 3000 }),
      '"Release to refresh" should be visible once the pull passes the threshold.',
    )

    await dispatchTouch(page, 'touchend', startY + 180)

    await waitForWithTimeoutMessage(
      () => page.locator('text=Refreshing tracks...').waitFor({ state: 'visible', timeout: 3000 }),
      '"Refreshing tracks..." should appear after releasing past the threshold.',
    )

    expect(await page.locator('.tracks-table').count()).to.equal(1)
  },
})

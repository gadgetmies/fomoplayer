const { expect } = require('chai')
const { test } = require('cascade-test')
const { getSharedContext, dismissOnboarding, waitForWithTimeoutMessage } = require('../lib/setup')
const { seedTracks } = require('../lib/seed')
const { resolveTestUserId } = require('../lib/test-user')

const getPlaybackControls = (page) => ({
  btn: page.locator('.button-playback').first(),
  pauseIcon: page.locator('.button-playback svg[data-icon="pause"]').first(),
  playIcon: page.locator('.button-playback svg[data-icon="play"]').first(),
})

const clickUnselectedTrack = async (page) => {
  const track = page.locator('.track:not(.selected):not(.playing)').first()
  await waitForWithTimeoutMessage(
    () => track.waitFor({ timeout: 5000 }),
    'Find a track that is not currently selected or playing before clicking.',
  )
  await track.click()
}

const ensurePlayIconVisible = async (page) => {
  const { btn, pauseIcon, playIcon } = getPlaybackControls(page)
  if (await pauseIcon.isVisible()) {
    await btn.click()
    await waitForWithTimeoutMessage(
      () => playIcon.waitFor({ timeout: 5000 }),
      'Normalize playback state back to play icon before assertions.',
    )
  }
}

test({
  setup: async () => {
    const { page } = await getSharedContext()
    const userId = await resolveTestUserId()
    await seedTracks({ userIds: [userId] })
    await page.goto('/tracks/recent')
    await waitForWithTimeoutMessage(
      () => page.waitForSelector('.tracks-table', { timeout: 15000 }),
      'Load the tracks table before running playback interactions.',
    )
    await dismissOnboarding(page)
    await page.locator('.track').first().click()
    return { page, timeout: 30000 }
  },

  'clicking a track selects it': async ({ page }) => {
    await page.goto('/tracks/recent')
    await waitForWithTimeoutMessage(
      () => page.waitForSelector('.tracks-table', { timeout: 15000 }),
      'Load tracks page before asserting selection behavior.',
    )
    await clickUnselectedTrack(page)
    expect(await page.locator('.track.selected').count()).to.equal(1)
  },

  'selecting a track starts playback': async ({ page }) => {
    await page.goto('/tracks/recent')
    await waitForWithTimeoutMessage(
      () => page.waitForSelector('.tracks-table', { timeout: 15000 }),
      'Load tracks page before asserting autoplay behavior.',
    )
    await clickUnselectedTrack(page)
    await waitForWithTimeoutMessage(
      () => getPlaybackControls(page).pauseIcon.waitFor({ timeout: 5000 }),
      'Verify playback starts after selecting a track.',
    )
    expect(await page.locator('.track.playing').count()).to.be.greaterThan(0)
  },

  'playback button is visible': async ({ page }) => {
    await page.goto('/tracks/recent')
    await waitForWithTimeoutMessage(
      () => page.waitForSelector('.tracks-table', { timeout: 15000 }),
      'Load tracks page before asserting playback button visibility.',
    )
    await page.locator('.track').first().click()
    const { btn } = getPlaybackControls(page)
    expect(await btn.isVisible()).to.be.true
  },

  'clicking a track changes play icon to pause': async ({ page }) => {
    await page.goto('/tracks/recent')
    await waitForWithTimeoutMessage(
      () => page.waitForSelector('.tracks-table', { timeout: 15000 }),
      'Load tracks page before asserting playback icon transitions.',
    )
    await page.locator('.track').first().click()
    await ensurePlayIconVisible(page)
    const { pauseIcon } = getPlaybackControls(page)
    await clickUnselectedTrack(page)
    await waitForWithTimeoutMessage(
      () => pauseIcon.waitFor({ timeout: 5000 }),
      'Verify playback switched to pause icon after selecting a track.',
    )
    expect(await getPlaybackControls(page).pauseIcon.count()).to.be.greaterThan(0)
  },

  'clicking pause restores play icon': async ({ page }) => {
    await page.goto('/tracks/recent')
    await waitForWithTimeoutMessage(
      () => page.waitForSelector('.tracks-table', { timeout: 15000 }),
      'Load tracks page before asserting pause and play toggling.',
    )
    await page.locator('.track').first().click()
    const { btn, pauseIcon, playIcon } = getPlaybackControls(page)
    await ensurePlayIconVisible(page)
    await btn.click()
    await waitForWithTimeoutMessage(
      () => pauseIcon.waitFor({ timeout: 5000 }),
      'Confirm playback enters playing state with pause icon.',
    )
    await btn.click()
    await waitForWithTimeoutMessage(
      () => playIcon.waitFor({ timeout: 5000 }),
      'Confirm playback returns to paused state with play icon.',
    )
    expect(await getPlaybackControls(page).playIcon.count()).to.be.greaterThan(0)
  },
})

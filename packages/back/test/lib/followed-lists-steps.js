// Shared browser steps and assertions for the followed-lists demo tests.
//
// On the Settings "Following" tab the followed artists, labels and playlists
// are listed as pills. The lists used to sit in a 185px-high scroll box; they
// now grow with their contents and scroll with the page. These steps open the
// tab, find the seeded followed artist in the artists list, and check that the
// list is not a scroll container.
//
// Imported verbatim by both the -local and -preview entry files.

const { expect } = require('chai')
const { waitForWithTimeoutMessage, dismissOnboarding } = require('./setup')
const { followedArtistName } = require('./follow-popup-seed')

const FOLLOWED_ARTISTS_LIST = '[data-test="followed-artists-list"]'

module.exports.gotoFollowedArtists = async (page) => {
  await page.goto('/settings/following')
  await waitForWithTimeoutMessage(
    () => page.waitForSelector('.settings-container', { timeout: 15000 }),
    'Render the settings container before checking the followed lists.',
  )
  await dismissOnboarding(page)
  await waitForWithTimeoutMessage(
    () => page.locator(FOLLOWED_ARTISTS_LIST, { hasText: followedArtistName }).waitFor({ timeout: 15000 }),
    `List the seeded followed artist "${followedArtistName}" on the Following tab.`,
  )
}

module.exports.assertFollowedListIsNotScrollContainer = async ({ page }) => {
  const list = page.locator(FOLLOWED_ARTISTS_LIST)
  await list.scrollIntoViewIfNeeded()
  const metrics = await list.evaluate((el) => {
    const style = getComputedStyle(el)
    return {
      overflowY: style.overflowY,
      maxHeight: style.maxHeight,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }
  })
  expect(metrics.overflowY, 'followed artists list must not scroll vertically').to.equal('visible')
  expect(metrics.maxHeight, 'followed artists list must not be height-capped').to.equal('none')
  expect(metrics.scrollHeight, 'followed artists list must show all its pills').to.be.at.most(metrics.clientHeight)
  await page.waitForTimeout(1500)
}

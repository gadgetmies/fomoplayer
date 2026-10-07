// Shared browser steps and assertions for the follow-popup demo tests.
// Imported verbatim by both the -local and -preview entry files so the only
// difference between the two is how the initial follow is seeded.

const { expect } = require('chai')
const { waitForWithTimeoutMessage, dismissOnboarding } = require('./setup')
const { followedTrackTitle, followedArtistName } = require('./follow-popup-seed')

const POPUP = '.full-screen-popup'
const ACTIVE_STORES = ['beatport', 'bandcamp']

const artistButton = (page, storeName) =>
  page
    .locator(`${POPUP} button`)
    .filter({ hasText: followedArtistName })
    .filter({ has: page.locator(`.store-icon-${storeName}`) })

const openFollowPopupForFollowedTrack = async (page) => {
  await page.goto('/tracks/recent')
  await waitForWithTimeoutMessage(
    () => page.waitForSelector('.tracks-table', { timeout: 15000 }),
    'Load the tracks table before opening the follow popup.',
  )
  await dismissOnboarding(page)
  await page.locator('.track').filter({ hasText: followedTrackTitle }).first().click()
  await page.locator('.preview-action_button').filter({ hasText: 'Follow' }).first().click()
  await waitForWithTimeoutMessage(
    () => artistButton(page, 'beatport').waitFor({ timeout: 15000 }),
    `Render the follow button for ${followedArtistName} on Beatport in the follow popup.`,
  )
}

// The popup lists only the stores whose follows it can see, and the follow
// button flips to unfollow (and back) once the request finishes.
const assertFollowButtonReflectsState = async ({ page }) => {
  const storeIcons = await page.locator(`${POPUP} button .store-icon`).evaluateAll((icons) =>
    icons.map((icon) => [...icon.classList].find((c) => c.startsWith('store-icon-')).replace('store-icon-', '')),
  )
  expect(storeIcons, 'popup lists at least one store').to.not.be.empty
  expect(ACTIVE_STORES, 'popup only lists stores the follow list covers').to.include.members(storeIcons)

  const button = artistButton(page, 'beatport')
  await waitForWithTimeoutMessage(
    () => button.filter({ hasText: 'Unfollow' }).waitFor({ timeout: 10000 }),
    `Show ${followedArtistName} as followed after seeding the follow.`,
  )

  // Click the "Unfollow" label: the artist name in the middle of the button is
  // a link to the store page and does not toggle the follow.
  await button.click({ position: { x: 30, y: 20 } })
  await waitForWithTimeoutMessage(
    () => button.filter({ hasText: /^\s*Follow /i }).waitFor({ timeout: 10000 }),
    `Flip the ${followedArtistName} button from Unfollow to Follow after unfollowing.`,
  )
}

module.exports = { openFollowPopupForFollowedTrack, assertFollowButtonReflectsState }

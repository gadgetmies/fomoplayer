const { expect } = require('chai')
const { waitForWithTimeoutMessage } = require('./setup')
const { ONE_PLAYER_TITLES } = require('./one-player-seed')
const { LONG_TEXT_TITLE, markOnePlayerTracksHeardViaApi } = require('./play-queue-source-seed')

// Shared browser interactions/assertions for the play-queue-source demo: next and previous follow the list a track was
// started from, not the list on screen. Both the local (demo-test) and preview (demo-preview) entry files import these
// verbatim, and both seed through the API.

const rowSelector = (title) => `.tracks-table .track:has-text("${title}")`
const playerTitle = (page) => page.locator('.preview_details_wrapper .preview_title').first()
const playingFrom = (page) => page.locator('.preview_details_wrapper .preview_playing-from').first()

const waitForPlayerTitle = (page, title, message) =>
  waitForWithTimeoutMessage(
    () =>
      page.waitForFunction(
        (title) => document.querySelector('.preview_details_wrapper .preview_title')?.textContent.includes(title),
        title,
        { timeout: 15000 },
      ),
    message,
  )

const seededTitlesInListOrder = async (page, seededTitles) => {
  const titles = (await page.locator('.tracks-table .track .title-cell').allTextContents()).map((t) => t.trim())
  return titles.filter((title) => seededTitles.some((seeded) => title.startsWith(seeded)))
}

// A client-side navigation through the top bar, so the player keeps its state
const openDefaultCartInApp = async (page) => {
  await page.locator('.menu_left a, .menu_left button').filter({ hasText: 'Carts' }).first().click()
  await page.locator('.popup_content-right a.pill-button').filter({ hasText: 'Default' }).first().click()
  await page.waitForURL(/\/carts\/[^/]+/, { timeout: 10000 })
  await waitForWithTimeoutMessage(
    () => page.waitForSelector(rowSelector(LONG_TEXT_TITLE), { timeout: 15000 }),
    'The default cart should show the long text track.',
  )
}

const openHeardInApp = async (page) => {
  await page.locator('.menu_left a, .menu_left button').filter({ hasText: 'Discover' }).first().hover()
  await page.locator('a[href="/tracks/heard"]').first().click()
  await page.waitForURL(/\/tracks\/heard/, { timeout: 10000 })
  await waitForWithTimeoutMessage(
    () => page.waitForSelector(rowSelector(ONE_PLAYER_TITLES[0]), { timeout: 15000 }),
    'The Heard list should show the one-player tracks once they have played.',
  )
}

const pressNext = async (page) => {
  await page.locator('.preview button[aria-label^="Next"]:visible').first().click()
}

const expectPlayingFrom = async (page, label) => {
  await playingFrom(page).waitFor({ state: 'visible', timeout: 10000 })
  expect((await playingFrom(page).textContent()).trim()).to.equal(`From ${label}`)
}

const assertNextWithCartOnScreenFollowsRecent = async ({ page, order }) => {
  await openDefaultCartInApp(page)
  await expectPlayingFrom(page, 'Discover · Recent')
  await pressNext(page)
  await waitForPlayerTitle(
    page,
    order[1],
    'Next with the cart on screen should play the next track of Discover · Recent, not a track of the cart.',
  )
  expect(await playerTitle(page).textContent()).not.to.contain(LONG_TEXT_TITLE)
  await expectPlayingFrom(page, 'Discover · Recent')
}

const assertNextAfterReloadFollowsRecent = async ({ page, order }) => {
  await page.reload()
  await waitForPlayerTitle(page, order[1], 'After a reload the player should show the track it was playing.')
  await openDefaultCartInApp(page)
  await expectPlayingFrom(page, 'Discover · Recent')
  await pressNext(page)
  await waitForPlayerTitle(
    page,
    order[2],
    'After a reload, next with the cart on screen should still play the next track of Discover · Recent.',
  )
  await expectPlayingFrom(page, 'Discover · Recent')
}

const assertNextFromHeardKeepsStepping = async ({ page }) => {
  await markOnePlayerTracksHeardViaApi(page)
  await page.reload()
  await page.waitForSelector('.preview_details_wrapper .preview_title', { timeout: 15000 })
  await openHeardInApp(page)
  const heardOrder = await seededTitlesInListOrder(page, ONE_PLAYER_TITLES)
  expect(heardOrder.length).to.equal(3)
  await page.locator(rowSelector(heardOrder[0])).first().click()
  await waitForPlayerTitle(page, heardOrder[0], 'The track should start when its row in Heard is clicked.')

  await openDefaultCartInApp(page)
  await expectPlayingFrom(page, 'Discover · Heard')
  // Each track played away from Heard moves to its top; the queue must keep the order it was started with
  await pressNext(page)
  await waitForPlayerTitle(page, heardOrder[1], 'Next should play the second track of Discover · Heard.')
  await pressNext(page)
  await waitForPlayerTitle(page, heardOrder[2], 'Next again should play the third track of Discover · Heard.')
  await expectPlayingFrom(page, 'Discover · Heard')
}

module.exports = {
  assertNextWithCartOnScreenFollowsRecent,
  assertNextAfterReloadFollowsRecent,
  assertNextFromHeardKeepsStepping,
}

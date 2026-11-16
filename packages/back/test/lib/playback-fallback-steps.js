const { expect } = require('chai')
const { dismissOnboarding, waitForWithTimeoutMessage } = require('./setup')
const {
  BROKEN_PREVIEW_URL_PATTERN,
  WORKING_PREVIEW_URL,
  FALLBACK_TRACK_TITLE,
  BROKEN_TRACK_TITLE,
} = require('./playback-fallback-seed')

// Shared browser interactions/assertions for the playback fallback demo. Both the local (demo-test) and preview
// (demo-preview) entry files import these verbatim.

const trackRow = (title) => `.tracks-table .track:has-text("${title}")`
// The icon is rendered in both the desktop and the mobile layout of the cell; only one of them is visible
const FAILED_ICON = '[data-testid="track-playback-failed"]:visible'

const failBrokenPreview = (page) =>
  page.route(BROKEN_PREVIEW_URL_PATTERN, (route) => route.fulfill({ status: 404, body: 'Not found' }))

const openRecentTracks = async (page) => {
  await failBrokenPreview(page)
  // The remote preview can be cold right after a deploy, so reload once before giving up
  await page.goto('/tracks/recent')
  try {
    await page.waitForSelector(trackRow(FALLBACK_TRACK_TITLE), { timeout: 20000 })
  } catch {
    await page.goto('/tracks/recent')
    await waitForWithTimeoutMessage(
      () => page.waitForSelector(trackRow(FALLBACK_TRACK_TITLE), { timeout: 20000 }),
      `Find the seeded "${FALLBACK_TRACK_TITLE}" track in the recent tracks list.`,
    )
  }
  await dismissOnboarding(page)
}

const waitForAudioToPlay = (page, message) =>
  waitForWithTimeoutMessage(
    () =>
      page.waitForFunction(
        (url) => {
          const audio = document.querySelector('audio')
          return audio?.src === url && audio.currentTime > 1
        },
        WORKING_PREVIEW_URL,
        { timeout: 20000 },
      ),
    message,
  )

const assertFallsBackToWorkingPreview = async ({ page }) => {
  await page.locator(trackRow(FALLBACK_TRACK_TITLE)).first().click()
  await waitForAudioToPlay(page, 'The player should fall back from the broken preview to the working sample.')

  const row = page.locator(trackRow(FALLBACK_TRACK_TITLE)).first()
  expect(await row.locator(FAILED_ICON).count()).to.equal(0)
  expect(await row.getAttribute('class')).to.include('playing')
}

const assertSkipsTrackWithoutPlayablePreview = async ({ page }) => {
  const brokenRow = page.locator(trackRow(BROKEN_TRACK_TITLE)).first()
  await brokenRow.click()

  await waitForWithTimeoutMessage(
    () => brokenRow.locator(FAILED_ICON).waitFor({ timeout: 20000 }),
    'A track none of whose previews play should get a warning triangle at the start of its row.',
  )
  await waitForWithTimeoutMessage(
    () =>
      page.waitForFunction(
        (title) =>
          !Array.from(document.querySelectorAll('.tracks-table .track.playing')).some((row) =>
            row.textContent.includes(title),
          ),
        BROKEN_TRACK_TITLE,
        { timeout: 20000 },
      ),
    'The player should skip to the next track after the failed one.',
  )
  // Give the recording a moment on the flagged row
  await page.waitForTimeout(1500)
}

module.exports = { openRecentTracks, assertFallsBackToWorkingPreview, assertSkipsTrackWithoutPlayablePreview }

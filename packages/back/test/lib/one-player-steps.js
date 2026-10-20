const { expect } = require('chai')
const { dismissOnboarding, waitForWithTimeoutMessage } = require('./setup')
const { ONE_PLAYER_TITLES } = require('./one-player-seed')

// Shared browser interactions/assertions for the one-player demo. Both the local (demo-test) and preview
// (demo-preview) entry files import these verbatim; only the seeding could differ, and both seed through the API.

const rowSelector = (title) => `.tracks-table .track:has-text("${title}")`
const audioIsPlaying = (page) =>
  page.waitForFunction(
    () => {
      const audio = document.querySelector('audio')
      return audio && !audio.paused && audio.currentTime > 1
    },
    null,
    { timeout: 20000 },
  )

// The seeded titles in the order the Recent list shows them
const seededTitlesInListOrder = async (page) => {
  const titles = (await page.locator('.tracks-table .track .title-cell').allTextContents()).map((t) => t.trim())
  return titles.filter((title) => ONE_PLAYER_TITLES.some((seeded) => title.startsWith(seeded)))
}

const playFromRecent = async (page) => {
  await page.goto('/tracks/recent')
  try {
    await page.waitForSelector(rowSelector(ONE_PLAYER_TITLES[0]), { timeout: 20000 })
  } catch {
    // The remote preview can be cold right after a deploy, so reload once before giving up
    await page.goto('/tracks/recent')
    await waitForWithTimeoutMessage(
      () => page.waitForSelector(rowSelector(ONE_PLAYER_TITLES[0]), { timeout: 20000 }),
      'Find the seeded one-player tracks in the Recent list.',
    )
  }
  await dismissOnboarding(page)

  const order = await seededTitlesInListOrder(page)
  expect(order.length).to.equal(3)
  await page.locator(rowSelector(order[0])).first().click()
  await waitForWithTimeoutMessage(() => audioIsPlaying(page), 'The track should start playing when its row is clicked.')
  return { order }
}

const assertPlayingFromRecent = async ({ page }) => {
  const playingFrom = page.locator('.preview .preview_details_wrapper .preview_playing-from')
  expect(await playingFrom.textContent()).to.contain('Playing from Discover · Recent')
  expect(await playingFrom.locator('a').getAttribute('href')).to.equal('/tracks/recent')
}

const openSettingsInApp = async (page) => {
  // A client-side navigation: a full page load would stop the audio
  await page.locator('a[href="/settings/following"]').first().click()
  await page.waitForSelector('.settings-container', { state: 'visible', timeout: 10000 })
}

const assertDockedPlayerKeepsPlaying = async ({ page, order }) => {
  await openSettingsInApp(page)
  const bar = page.locator('.docked-player')
  await waitForWithTimeoutMessage(
    () => bar.waitFor({ state: 'visible', timeout: 5000 }),
    'Settings should show the docked mini player while a track is playing.',
  )
  expect(await bar.locator('.docked-player_title').textContent()).to.contain(order[0])
  expect(await bar.locator('.preview_playing-from').textContent()).to.contain('Discover · Recent')
  const before = await page.$eval('audio', (audio) => audio.currentTime)
  await page.waitForTimeout(1500)
  const after = await page.$eval('audio', (audio) => ({ time: audio.currentTime, paused: audio.paused }))
  expect(after.paused).to.equal(false)
  expect(after.time).to.be.greaterThan(before)
}

const assertDockedNextFollowsSource = async ({ page, order }) => {
  await page.locator('.docked-player button[aria-label^="Next"]').click()
  await waitForWithTimeoutMessage(
    () =>
      page.waitForFunction(
        (title) => document.querySelector('.docked-player_title')?.textContent.includes(title),
        order[1],
        { timeout: 10000 },
      ),
    'Next on the docked player should play the next track of Discover · Recent.',
  )
  await waitForWithTimeoutMessage(() => audioIsPlaying(page), 'The next track should start playing.')
}

// The docked bar's waveform shows the position in the track and seeks where it is clicked
const assertDockedWaveformSeeks = async ({ page }) => {
  const waveform = page.locator('[data-testid="docked-player-waveform"]')
  await waveform.waitFor({ state: 'visible', timeout: 5000 })
  const box = await waveform.boundingBox()
  expect(box.height).to.be.at.least(40)
  const timeText = () => page.locator('[data-testid="docked-player-time"]').textContent()
  expect(await timeText()).to.match(/^\d+:\d\d$/)
  expect(await timeText()).not.to.equal('0:00')
  expect(await page.locator('[data-testid="docked-player-duration"]').textContent()).to.match(/^\d+:\d\d$/)

  // Click the middle of the playable part (between the dimmed edges)
  const playable = await waveform.evaluate((el) => {
    const [left, right] = [...el.querySelectorAll('[class^="waveform_clip-edge-overlay"]')].map(
      (overlay) => overlay.getBoundingClientRect().width / el.clientWidth,
    )
    return { start: left, end: 1 - right }
  })
  const before = await page.$eval('audio', (audio) => audio.currentTime)
  const fraction = playable.start + (playable.end - playable.start) * 0.8
  await page.mouse.click(box.x + box.width * fraction, box.y + box.height / 2)
  await waitForWithTimeoutMessage(
    () =>
      page.waitForFunction((previous) => document.querySelector('audio').currentTime > previous + 5, before, {
        timeout: 5000,
      }),
    'Clicking the docked waveform should seek forward.',
  )
}

const assertDockedPauseStopsAudio = async ({ page }) => {
  await page.locator('.docked-player button[aria-label="Pause"]').click()
  await page.waitForFunction(() => document.querySelector('audio')?.paused === true, null, { timeout: 5000 })
  await page.locator('.docked-player button[aria-label="Play"]').click()
  await waitForWithTimeoutMessage(() => audioIsPlaying(page), 'Play on the docked player should resume playback.')
}

const assertPlayingFromSearchSwitchesSource = async ({ page }) => {
  // Back to the list through the "Playing from" link, then start a track from a search
  await page.locator('.docked-player .preview_playing-from a').click()
  await page.waitForSelector('.tracks-table', { state: 'visible', timeout: 10000 })
  const searchInput = page.locator('.search_input_pills').first()
  await searchInput.fill('One Player Demo')
  await searchInput.press('Enter')
  await page.waitForURL(/\/search/, { timeout: 10000 })
  await page.waitForSelector(rowSelector(ONE_PLAYER_TITLES[2]), { timeout: 15000 })
  await page.locator(rowSelector(ONE_PLAYER_TITLES[2])).first().click()
  const playingFrom = page.locator('.preview_details_wrapper .preview_playing-from')
  try {
    await page.waitForFunction(
      () => document.querySelector('.preview_details_wrapper .preview_playing-from')?.textContent.includes('Search · '),
      null,
      { timeout: 10000 },
    )
  } catch {
    throw new Error(
      `Playing a search result should make the search the source; the player says "${await playingFrom.textContent()}" at ${page.url()}`,
    )
  }
  const label = (await playingFrom.textContent()).toLowerCase()
  expect(label).to.contain('playing from search · ')
  expect(label).to.contain('one player demo')
}

module.exports = {
  playFromRecent,
  assertPlayingFromRecent,
  assertDockedPlayerKeepsPlaying,
  assertDockedNextFollowsSource,
  assertDockedWaveformSeeks,
  assertDockedPauseStopsAudio,
  assertPlayingFromSearchSwitchesSource,
}

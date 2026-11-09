const { expect } = require('chai')
const { dismissOnboarding, waitForWithTimeoutMessage } = require('./setup')
const { WAVEFORM_SEEK_TRACK_TITLE } = require('./waveform-seek-seed')

// Shared browser interactions/assertions for the waveform seek demo. Both the local (demo-test) and preview
// (demo-preview) entry files import these verbatim.

const TRACK_SELECTOR = `.tracks-table .track:has-text("${WAVEFORM_SEEK_TRACK_TITLE}")`
// The track has no stored waveform, so the only waveform image is the one generated from the sample (a data URL)
const GENERATED_WAVEFORM_SELECTOR = '.waveform_container img.waveform-background[src^="data:"]'

const getAudioTime = (page) => page.$eval('audio', (audio) => audio.currentTime)

// The progress overlay is a clip-path polygon whose second point is the playback position on the waveform
const getProgressPercent = (page) =>
  page.$eval('.waveform_container .waveform-position', (el) => {
    const clipPath = el.style.clipPath || el.style.webkitClipPath
    return Number(clipPath.match(/[\d.]+%/g)[1].replace('%', ''))
  })

const playWaveformlessTrack = async (page) => {
  // The remote preview can be cold right after a deploy, so reload once before giving up
  await page.goto('/tracks/recent')
  try {
    await page.waitForSelector(TRACK_SELECTOR, { timeout: 20000 })
  } catch {
    await page.goto('/tracks/recent')
    await waitForWithTimeoutMessage(
      () => page.waitForSelector(TRACK_SELECTOR, { timeout: 20000 }),
      `Find the seeded "${WAVEFORM_SEEK_TRACK_TITLE}" track in the recent tracks list.`,
    )
  }
  await dismissOnboarding(page)

  await page.locator(TRACK_SELECTOR).first().click()
  await waitForWithTimeoutMessage(
    () => page.waitForSelector(GENERATED_WAVEFORM_SELECTOR, { timeout: 20000 }),
    'The player should generate a waveform from the sample when the track has no stored waveform.',
  )
  await waitForWithTimeoutMessage(
    () => page.waitForFunction(() => document.querySelector('audio')?.currentTime > 2, null, { timeout: 20000 }),
    'The sample should start playing after selecting the track.',
  )
}

const assertProgressStaysOnWaveform = async ({ page }) => {
  const audioTime = await getAudioTime(page)
  const progressPercent = await getProgressPercent(page)

  // The waveform spans only the 120 s sample, so the progress is measured from its left edge
  expect(progressPercent).to.be.greaterThan(0)
  expect(progressPercent).to.be.lessThan(25)
  expect(progressPercent).to.be.closeTo((audioTime / 120) * 100, 5)
}

const assertClickingWaveformSeeks = async ({ page }) => {
  const waveform = page.locator('.waveform_container')
  const { width, height } = await waveform.boundingBox()
  await waveform.click({ position: { x: width * 0.75, y: height / 2 } })

  await waitForWithTimeoutMessage(
    () => page.waitForFunction(() => document.querySelector('audio')?.currentTime > 85, null, { timeout: 5000 }),
    'Clicking three quarters into the waveform should seek ~90 s into the 120 s sample.',
  )
  const audioTime = await getAudioTime(page)
  expect(audioTime).to.be.closeTo(90, 6)

  await page.waitForTimeout(1500)
  const progressPercent = await getProgressPercent(page)
  expect(progressPercent).to.be.closeTo(75, 5)
  expect(progressPercent).to.be.at.most(100)
}

module.exports = { playWaveformlessTrack, assertProgressStaysOnWaveform, assertClickingWaveformSeeks }

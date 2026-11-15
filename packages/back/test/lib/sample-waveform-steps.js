const { expect } = require('chai')
const { dismissOnboarding, waitForWithTimeoutMessage } = require('./setup')
const { SAMPLE_WAVEFORM_FILENAME, SAMPLE_WAVEFORM_DURATION_SECONDS } = require('./sample-waveform-seed')

// Shared browser interactions/assertions for the sample waveform demo. Both the local (demo-test) and preview
// (demo-preview) entry files import these verbatim; only how the sample gets stored differs.

const getAudioTime = (page) => page.$eval('audio', (audio) => audio.currentTime)

// The progress overlay is a clip-path polygon whose second point is the playback position on the waveform
const getProgressPercent = (page) =>
  page.$eval('.waveform_container .waveform-position', (el) => {
    const clipPath = el.style.clipPath || el.style.webkitClipPath
    return Number(clipPath.match(/[\d.]+%/g)[1].replace('%', ''))
  })

const previewDuration = (page) =>
  page.evaluate(() => {
    const label = [...document.querySelectorAll('.preview_label')].find((el) => el.textContent.startsWith('Duration'))
    return label?.nextElementSibling?.textContent ?? null
  })

const storedSample = (page) =>
  page.evaluate(
    async (filename) =>
      (await fetch('/api/me/notifications/audio-samples', { credentials: 'same-origin' }).then((r) => r.json())).find(
        (sample) => sample.filename === filename,
      ),
    SAMPLE_WAVEFORM_FILENAME,
  )

const playUploadedSample = async (page) => {
  await page.goto('/notifications/samples')
  const play = page.locator(`button[aria-label="Play ${SAMPLE_WAVEFORM_FILENAME}"]`)
  await waitForWithTimeoutMessage(
    () => play.first().waitFor({ state: 'visible', timeout: 20000 }),
    `The uploaded "${SAMPLE_WAVEFORM_FILENAME}" should be listed under Notifications › Samples.`,
  )
  await dismissOnboarding(page)
  await play.first().click()
  await waitForWithTimeoutMessage(
    () =>
      page.waitForFunction(() => document.querySelector('audio')?.currentTime > 1, null, {
        timeout: 20000,
      }),
    'The sample should start playing after clicking Play.',
  )
}

const assertStoredWaveformShown = async ({ page }) => {
  const sample = await storedSample(page)
  expect(sample.waveformUrl, 'the upload renders and stores a waveform').to.be.a('string')
  expect(sample.durationMs).to.be.closeTo(SAMPLE_WAVEFORM_DURATION_SECONDS * 1000, 150)

  // The player shows the stored image rather than decoding the sample in the browser
  await waitForWithTimeoutMessage(
    () =>
      page.waitForFunction(
        (url) => document.querySelector('.waveform_container img.waveform-background')?.getAttribute('src') === url,
        sample.waveformUrl,
        { timeout: 10000 },
      ),
    'The player should show the waveform stored with the sample.',
  )
  await page.waitForFunction(
    () => document.querySelector('.waveform_container img.waveform-background')?.naturalWidth > 0,
    null,
    { timeout: 10000 },
  )
  // The stored duration is shown and lays out the timeline: the progress follows the audio from the left edge
  expect(await previewDuration(page)).to.not.equal('-')
  const audioTime = await getAudioTime(page)
  expect(await getProgressPercent(page)).to.be.closeTo((audioTime / SAMPLE_WAVEFORM_DURATION_SECONDS) * 100, 6)
}

const assertClickingWaveformSeeks = async ({ page }) => {
  const waveform = page.locator('.waveform_container')
  const { width, height } = await waveform.boundingBox()
  await waveform.click({ position: { x: width * 0.75, y: height / 2 } })

  const target = SAMPLE_WAVEFORM_DURATION_SECONDS * 0.75
  await waitForWithTimeoutMessage(
    () =>
      page.waitForFunction((t) => Math.abs(document.querySelector('audio')?.currentTime - t) < 1.5, target, {
        timeout: 5000,
      }),
    'Clicking three quarters into the waveform should seek three quarters into the sample.',
  )
  // The progress follows on the player's next timeupdate
  await waitForWithTimeoutMessage(
    () =>
      page.waitForFunction(
        () => {
          const el = document.querySelector('.waveform_container .waveform-position')
          const clipPath = el?.style.clipPath || el?.style.webkitClipPath || ''
          const percent = Number((clipPath.match(/[\d.]+%/g) ?? [])[1]?.replace('%', ''))
          return Math.abs(percent - 75) < 8
        },
        null,
        { timeout: 5000 },
      ),
    'The progress on the waveform should move to where it was clicked.',
  )
  expect(await getProgressPercent(page)).to.be.closeTo(75, 8)

  // And back to the quiet start
  await waveform.click({ position: { x: width * 0.1, y: height / 2 } })
  await waitForWithTimeoutMessage(
    () =>
      page.waitForFunction((t) => document.querySelector('audio')?.currentTime < t, target - 10, {
        timeout: 5000,
      }),
    'Clicking near the start of the waveform should seek back.',
  )
  expect(await getAudioTime(page)).to.be.closeTo(SAMPLE_WAVEFORM_DURATION_SECONDS * 0.1, 1.5)
}

module.exports = { playUploadedSample, assertStoredWaveformShown, assertClickingWaveformSeeks }

const { expect } = require('chai')
const { waitForWithTimeoutMessage } = require('./setup')

// Browser steps for the player's controls, shared by the demos that exercise them in different places (the docked bar
// on wider screens, the expanded player on phones). Each takes where the control is and whether to click or tap it.

const press = (locator, { tap = false } = {}) => (tap ? locator.tap() : locator.click())

const audioIsPlaying = (page) =>
  page.waitForFunction(() => document.querySelector('audio')?.paused === false, null, { timeout: 20000 })

const assertStillPlaying = async (page) => {
  expect(await page.$eval('audio', (audio) => audio.paused)).to.equal(false)
}

// The cart button adds the track to the default cart and removes it again (so re-runs start from the same state)
const assertCartButtonToggles = async (page, selector, { tap = false, where } = {}) => {
  const before = await page.locator(selector).getAttribute('title')
  const waitForTitle = (changed) =>
    page.waitForFunction(
      ({ selector, before, changed }) => {
        const button = document.querySelector(selector)
        return button && !button.disabled && (button.getAttribute('title') !== before) === changed
      },
      { selector, before, changed },
      { timeout: 10000 },
    )
  await press(page.locator(selector), { tap })
  await waitForWithTimeoutMessage(
    () => waitForTitle(true),
    `The cart button ${where} should add the track to (or remove it from) the default cart.`,
  )
  await page.waitForTimeout(800)
  await press(page.locator(selector), { tap })
  await waitForTitle(false)
}

// Preview / Listen switch the audio source (the preferFullTracks setting), and are left as they were found. label(text)
// finds the switch.
const assertPreviewListenSwitch = async (page, label, { tap = false } = {}) => {
  const preferFullTracks = () => page.evaluate(() => localStorage.getItem('preferFullTracks'))
  const initial = await preferFullTracks()
  await press(label('Listen'), { tap })
  expect(await preferFullTracks()).to.equal('true')
  await page.waitForTimeout(800)
  await press(label('Preview'), { tap })
  expect(await preferFullTracks()).to.equal('false')
  if (initial === 'true') await press(label('Listen'), { tap })
}

// The docked bar names the track's labels under the title ("On: ..."), linked like the panel's
const assertDockedBarShowsLabels = async (page) => {
  const labels = page.locator('.docked-player .docked-player_labels')
  expect(await labels.isVisible(), 'the labels in the docked bar').to.equal(true)
  expect(await labels.textContent()).to.match(/^On:\s+\S/)
  expect(await labels.locator('a').count()).to.be.at.least(1)
}

// Plays the track named title from a search for it (a search also lists tracks already heard, so this works on re-runs
// against the persistent preview) and opens Settings in the app, where the player docks
const playFromSearchAndOpenSettings = async (page, title, { tap = false } = {}) => {
  const searchInput = page.locator('.search_input_pills').first()
  await searchInput.fill(title)
  await searchInput.press('Enter')
  await page.waitForURL(/\/search/, { timeout: 10000 })
  const row = page.locator('.tracks-table .track', { hasText: title }).first()
  await waitForWithTimeoutMessage(
    () => row.waitFor({ state: 'visible', timeout: 15000 }),
    `The search should list "${title}".`,
  )
  await press(row, { tap })
  await waitForWithTimeoutMessage(() => audioIsPlaying(page), 'The track from the search should start playing.')
  await press(page.locator('a[href^="/settings"]:visible').first(), { tap })
  await page.waitForSelector('.settings-container', { state: 'visible', timeout: 10000 })
  await page.locator('.docked-player').waitFor({ state: 'visible', timeout: 5000 })
}

// Artists, labels and title too long for the docked bar are cut short with an ellipsis on their own line, inside the
// track's column: neither the bar nor the page scrolls sideways. On the title line artists and title are cut short
// separately, the artists first, so the title still shows however many artists there are.
const assertDockedBarTextsEllipsed = async (page) => {
  const { lines, parts, info, bar, viewport } = await page.evaluate(() => {
    const measure = (element) => {
      const style = getComputedStyle(element)
      const box = element.getBoundingClientRect()
      return {
        name: element.className,
        truncated: element.scrollWidth > element.clientWidth,
        ellipsis: style.textOverflow === 'ellipsis' && style.whiteSpace === 'nowrap' && style.overflow === 'hidden',
        width: box.width,
        fullWidth: element.scrollWidth,
        right: box.right,
        height: box.height,
      }
    }
    const infoElement = document.querySelector('.docked-player_info')
    const title = infoElement.querySelector('.docked-player_title')
    const barElement = document.querySelector('.docked-player')
    return {
      info: infoElement.getBoundingClientRect().toJSON(),
      bar: { scroll: barElement.scrollWidth, client: barElement.clientWidth },
      viewport: { scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth },
      lines: [...infoElement.children].map(measure),
      parts: {
        line: measure(title),
        artists: measure(title.querySelector('.track-title_artists')),
        name: measure(title.querySelector('.track-title_name')),
      },
    }
  })
  for (const line of lines) {
    expect(line.ellipsis, `${line.name} ends in an ellipsis`).to.equal(true)
    expect(line.right, `${line.name} stays in the track's column`).to.be.at.most(info.right + 1)
    // One line each: nothing wraps onto a second
    expect(line.height, `${line.name} is one line`).to.be.below(30)
  }
  expect(lines.find((line) => line.name === 'docked-player_labels').truncated, 'the labels are cut short').to.equal(
    true,
  )
  // The artists give way to the title: cut short, while the title keeps at least half the line (or all it needs)
  expect(parts.artists.ellipsis && parts.name.ellipsis, 'artists and title end in an ellipsis').to.equal(true)
  expect(parts.artists.truncated, 'the artists are cut short').to.equal(true)
  expect(parts.artists.width, 'a few letters of the artists remain').to.be.above(20)
  expect(parts.name.width, 'the title shows').to.be.at.least(Math.min(parts.name.fullWidth, parts.line.width / 2))
  expect(bar.scroll, 'the bar does not scroll sideways').to.be.at.most(bar.client)
  expect(viewport.scroll, 'the page does not scroll sideways').to.be.at.most(viewport.client)
}

module.exports = {
  audioIsPlaying,
  assertStillPlaying,
  assertCartButtonToggles,
  assertPreviewListenSwitch,
  assertDockedBarShowsLabels,
  playFromSearchAndOpenSettings,
  assertDockedBarTextsEllipsed,
}

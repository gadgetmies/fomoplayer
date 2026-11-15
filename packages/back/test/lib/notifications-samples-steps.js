const { expect } = require('chai')
const { dismissOnboarding, waitForWithTimeoutMessage } = require('./setup')
const { SAMPLES } = require('./notifications-samples-seed')
const { ONE_PLAYER_TITLES } = require('./one-player-seed')

// Shared browser steps for the notifications-samples demo: the Samples tab as an accordion. Each step takes the
// context the entry file's setup returns ({ page, mobilePage, ids }); the local entry adds the steps that need the
// DB-seeded match and embeddings.

const sampleRow = (page, filename) =>
  page.locator('.notifications-sample', {
    has: page.locator('.notifications-sample_name', { hasText: filename }),
  })

const isOpen = async (page, filename) =>
  (await sampleRow(page, filename).locator('.notifications-sample_toggle').getAttribute('aria-expanded')) === 'true'

const waitUntilOpen = (page, filename, message) =>
  waitForWithTimeoutMessage(
    () =>
      sampleRow(page, filename).locator('.notifications-sample_content').waitFor({ state: 'visible', timeout: 10000 }),
    message,
  )

const openSamplesTab = async (page, query = '') => {
  await page.goto(`/notifications/samples${query}`)
  await dismissOnboarding(page)
  await waitForWithTimeoutMessage(
    () => page.waitForSelector('.notifications-samples', { state: 'visible', timeout: 15000 }),
    'The Samples tab should list the seeded samples.',
  )
}

const openSample = async (page, filename) => {
  if (!(await isOpen(page, filename))) await sampleRow(page, filename).locator('.notifications-sample_toggle').click()
  await waitUntilOpen(page, filename, `Opening ${filename} should show its content under its row.`)
}

// The newest sample is open on arrival; opening another one closes it and shows the new one's content under its row
const assertOpeningASampleClosesTheOther = async ({ page }) => {
  await openSamplesTab(page)
  await waitUntilOpen(page, SAMPLES.matched, 'The newest sample should be open when the tab opens.')

  // Click where the name is: the row's expand button covers the whole header, name included
  const name = await sampleRow(page, SAMPLES.other).locator('.notifications-sample_name').boundingBox()
  await page.mouse.click(name.x + name.width / 2, name.y + name.height / 2)
  await waitUntilOpen(page, SAMPLES.other, 'Clicking a sample row should open it.')
  expect(await isOpen(page, SAMPLES.matched)).to.equal(false)
  expect(await sampleRow(page, SAMPLES.matched).locator('.notifications-sample_content').count()).to.equal(0)
  expect(await page.locator('.notifications-sample_content').count()).to.equal(1)

  // Opening the open sample again closes it
  await sampleRow(page, SAMPLES.other).locator('.notifications-sample_toggle').click()
  await sampleRow(page, SAMPLES.other).locator('.notifications-sample_content').waitFor({ state: 'detached' })
  expect(await page.locator('.notifications-sample_content').count()).to.equal(0)
}

// The open sample's header holds the Matches / Sounds like toggle; only the selected list shows
const assertMatchesAndSoundsLikeToggle = async ({ page }) => {
  await openSample(page, SAMPLES.other)
  const row = sampleRow(page, SAMPLES.other)
  const views = row.locator('.notifications-sample_header .notifications-sample_views')
  await views.waitFor({ state: 'visible', timeout: 5000 })
  expect(await views.locator('[aria-pressed="true"]').textContent()).to.match(/^Matches/)
  // No match yet for a fresh sample
  await row.locator('.notifications-sample_content .notifications-empty', { hasText: 'No match yet' }).waitFor()

  await views.locator('button', { hasText: 'Sounds like' }).click()
  expect(await views.locator('[aria-pressed="true"]').textContent()).to.match(/^Sounds like/)
  // Not analysed yet (uploaded samples on a preview), or the tracks that sound like it
  await row
    .locator('.notifications-sample_content .notifications-empty, .notifications-sample_content .notifications-similar')
    .first()
    .waitFor()
  expect(await row.locator('.notifications-matches').count()).to.equal(0)

  await views.locator('button', { hasText: 'Matches' }).click()
  await row.locator('.notifications-sample_content .notifications-empty', { hasText: 'No match yet' }).waitFor()
}

// Delete asks first; cancelling keeps the sample and leaves it open
const assertCancelledDeleteKeepsSample = async ({ page }) => {
  await openSample(page, SAMPLES.other)
  page.once('dialog', (dialog) => dialog.dismiss())
  await sampleRow(page, SAMPLES.other).locator('.notifications-sample_delete').click()
  await page.waitForTimeout(500)
  expect(await sampleRow(page, SAMPLES.other).count()).to.equal(1)
  expect(await isOpen(page, SAMPLES.other)).to.equal(true)
}

const assertConfirmedDeleteRemovesSample = async ({ page }) => {
  page.once('dialog', (dialog) => dialog.accept())
  await sampleRow(page, SAMPLES.deletable).locator('.notifications-sample_delete').click()
  await waitForWithTimeoutMessage(
    () => sampleRow(page, SAMPLES.deletable).waitFor({ state: 'detached', timeout: 10000 }),
    'Confirming the delete should remove the sample from the list.',
  )
}

// A match email links to /notifications/samples?sample=<id>: that sample opens; an unknown id opens the tab as usual
const assertLinkOpensSample = async ({ page, ids }) => {
  await openSamplesTab(page, `?sample=${ids.other}`)
  await waitUntilOpen(page, SAMPLES.other, 'A link with ?sample=<id> should open that sample.')
  expect(await isOpen(page, SAMPLES.matched)).to.equal(false)

  await openSamplesTab(page, '?sample=999999999')
  await waitUntilOpen(page, SAMPLES.matched, 'An unknown sample id should open the tab with the newest sample open.')
}

// On a phone the tab fits the screen: no sideways scrolling, and the toggle gets a line of its own in the header
const assertPhoneLayoutFits = async ({ mobilePage }) => {
  await openSamplesTab(mobilePage)
  await waitUntilOpen(mobilePage, SAMPLES.matched, 'The newest sample should be open on the phone too.')
  const views = sampleRow(mobilePage, SAMPLES.matched).locator('.notifications-sample_views')
  await views.waitFor({ state: 'visible', timeout: 5000 })
  const overflow = await mobilePage.evaluate(() => {
    const page = document.querySelector('.notifications-page')
    return {
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      page: page ? page.scrollWidth - page.clientWidth : 0,
    }
  })
  expect(overflow.document, 'the document should not scroll sideways').to.be.at.most(0)
  expect(overflow.page, 'the Samples tab should not scroll sideways').to.be.at.most(0)
  // The toggle sits below the sample's name, spanning the header
  const nameBox = await sampleRow(mobilePage, SAMPLES.matched).locator('.notifications-sample_name').boundingBox()
  const viewsBox = await views.boundingBox()
  expect(viewsBox.y).to.be.greaterThan(nameBox.y + nameBox.height - 1)
}

// The open sample's track table has no gap to the sample's edges or its header
const assertFlushWithSample = async (row, table) => {
  const content = await row.locator('.notifications-sample_content').boundingBox()
  const tableBox = await table.boundingBox()
  expect(tableBox.x, "the table starts at the sample's left edge").to.be.closeTo(content.x, 0.5)
  expect(tableBox.y, "the table starts right under the sample's header").to.be.closeTo(content.y, 0.5)
  expect(tableBox.width, 'the table spans the sample').to.be.closeTo(content.width, 0.5)
}

// Local only: the DB-seeded match is listed in Matches with the main track list's rows and cells, flush with the
// open sample, where and at what tempo the sample was found in a Match column; on a phone that moves into the details
const assertMatchListed = async ({ page, mobilePage }) => {
  await openSamplesTab(page)
  await openSample(page, SAMPLES.matched)
  const row = sampleRow(page, SAMPLES.matched)
  const table = row.locator('table.tracks-table.notifications-matches')
  const match = table.locator('tbody > tr.track').first()
  await match.waitFor({ state: 'visible', timeout: 10000 })
  for (const header of ['Artist', 'Title', 'Label', 'Released', 'Genre', 'BPM', 'Key', 'Match', 'Cart']) {
    expect(await table.locator('thead').textContent()).to.contain(header)
  }
  expect(await match.locator('.title-cell').textContent()).to.contain(ONE_PLAYER_TITLES[2])
  for (const cell of ['.artist-cell', '.label-cell', '.released-cell', '.genre-cell', '.bpm-cell', '.key-cell']) {
    expect(await match.locator(cell).count(), `a match row should have a ${cell}`).to.equal(1)
  }
  const info = match.locator('.why-cell--column .notifications-match_info')
  expect(await info.locator('.matched-at').textContent()).to.match(/^at \d+:\d\d$/)
  expect(await info.locator('.tempo').textContent()).to.equal('±0.0 %')
  expect(await info.locator('.score').textContent()).to.match(/^score \d+$/)
  expect(await info.locator('svg').count(), 'the match chip has no icon').to.equal(0)
  await assertFlushWithSample(row, table)
  // The Match header and chip sit in the middle of their column
  const column = await table.locator('thead .why-cell--column').boundingBox()
  const headerText = await table.locator('thead .why-cell--column .text-header-cell').evaluate((cell) => {
    const range = document.createRange()
    range.selectNodeContents(cell)
    const { left, width } = range.getBoundingClientRect()
    return { left, width }
  })
  const chip = await info.boundingBox()
  const middle = column.x + column.width / 2
  expect(headerText.left + headerText.width / 2, 'Match is centred in its column').to.be.closeTo(middle, 1)
  expect(chip.x + chip.width / 2, 'the match chip is centred under Match').to.be.closeTo(middle, 1)
  await info.hover()

  await openSamplesTab(mobilePage)
  const phoneMatch = sampleRow(mobilePage, SAMPLES.matched).locator('.notifications-matches > tbody > tr.track').first()
  await phoneMatch.waitFor({ state: 'visible', timeout: 10000 })
  expect(await phoneMatch.locator('.why-cell--column').isVisible()).to.equal(false)
  const phoneInfo = phoneMatch.locator('.why-cell--inline .notifications-match_info')
  expect(await phoneInfo.isVisible(), 'on a phone the match details sit in the row').to.equal(true)
  expect(await phoneInfo.locator('.tempo').textContent()).to.equal('±0.0 %')
  expect(await mobilePage.locator('.notifications-matches .tracks-table-header-columns').isVisible()).to.equal(false)
}

// Local only (the uploaded preview samples are not real audio): play leaves the row as it was
const assertPlayDoesNotOpenSample = async ({ page }) => {
  await openSamplesTab(page)
  expect(await isOpen(page, SAMPLES.other)).to.equal(false)
  await sampleRow(page, SAMPLES.other).locator('.notifications-sample_play').click()
  await waitForWithTimeoutMessage(
    () => page.waitForSelector(`.preview_title:has-text("${SAMPLES.other}")`, { timeout: 10000 }),
    'Play should load the sample in the player.',
  )
  expect(await isOpen(page, SAMPLES.other)).to.equal(false)
}

// Local only: the DB-seeded embeddings give Sounds like tracks and suggestions; following one removes it
const assertFollowingASuggestionRemovesIt = async ({ page }) => {
  await openSamplesTab(page)
  await openSample(page, SAMPLES.matched)
  const row = sampleRow(page, SAMPLES.matched)
  await row.locator('.notifications-sample_views button', { hasText: 'Sounds like' }).click()
  await row.locator('.notifications-similar > tbody > tr').first().waitFor({ timeout: 10000 })
  const button = row.locator('.notifications-follow-list button').first()
  await waitForWithTimeoutMessage(
    () => button.waitFor({ state: 'visible', timeout: 10000 }),
    'Sounds like should suggest an artist or label to follow.',
  )
  const label = (await button.textContent()).trim()
  expect(label).to.match(/^Follow .+ · \d+ similar tracks?$/)
  const before = await row.locator('.notifications-follow-list button').count()
  await button.click()
  await waitForWithTimeoutMessage(
    () =>
      page.waitForFunction(
        (count) => document.querySelectorAll('.notifications-follow-list button').length < count,
        before,
        { timeout: 10000 },
      ),
    'A followed suggestion should no longer be offered.',
  )
}

// Local only: Sounds like lists the tracks as a similarity search lists its results, flush with the open sample
const assertSoundsLikeShowsTrackInfo = async ({ page }) => {
  await openSamplesTab(page)
  await openSample(page, SAMPLES.matched)
  const row = sampleRow(page, SAMPLES.matched)
  await row.locator('.notifications-sample_views button', { hasText: 'Sounds like' }).click()
  const table = row.locator('table.tracks-table.notifications-similar')
  const track = table.locator('tbody > tr.track').first()
  await waitForWithTimeoutMessage(
    () => track.waitFor({ state: 'visible', timeout: 10000 }),
    'Sounds like should list the tracks as rows of the track list.',
  )
  // The same columns as similarity search results: artist, title, label, released, genre, BPM, key, Diff and cart
  for (const header of ['Artist', 'Title', 'Label', 'Released', 'Genre', 'BPM', 'Key', 'Diff', 'Cart']) {
    expect(await table.locator('thead').textContent()).to.contain(header)
  }
  for (const cell of ['.artist-cell', '.title-cell', '.label-cell', '.released-cell', '.genre-cell', '.bpm-cell', '.key-cell']) {
    expect(await track.locator(cell).count(), `a Sounds like row should have a ${cell}`).to.equal(1)
  }
  // The audio distance ×100 with one decimal, as similarity search results show it
  expect(await track.locator('.similarity-cell').textContent()).to.match(/^\d+\.\d$/)
  expect(await track.locator('.title-cell').textContent()).to.not.equal('')
  expect(await row.locator('.notifications-sample_content').textContent()).to.not.contain('closest to the sample')
  await track.locator('.similarity-cell').hover()

  await assertFlushWithSample(row, table)

  // The Diff pill sits in the middle of its column, under the header
  const header = await table.locator('thead .score-cell').boundingBox()
  const pill = await track.locator('.similarity-cell button').boundingBox()
  expect(pill.x + pill.width / 2, 'the Diff pill is centred under Diff').to.be.closeTo(header.x + header.width / 2, 1)
}

// Local only: playing a Sounds like track and finding tracks similar to it shows the same audio distance figure in
// the search results' Diff column
const assertSimilaritySearchShowsDistance = async ({ page }) => {
  await openSamplesTab(page)
  await openSample(page, SAMPLES.matched)
  const row = sampleRow(page, SAMPLES.matched)
  await row.locator('.notifications-sample_views button', { hasText: 'Sounds like' }).click()
  const track = row.locator('.notifications-similar > tbody > tr.track').first()
  await track.waitFor({ state: 'visible', timeout: 10000 })
  const title = (await track.locator('.title-cell').textContent()).trim()
  await track.locator('.title-cell').click()
  await waitForWithTimeoutMessage(
    () => page.waitForSelector(`.preview_title:has-text("${title}")`, { timeout: 10000 }),
    'Clicking a Sounds like track should load it in the player.',
  )

  await page.locator('button[aria-label="Find similar"]').click()
  const cells = page.locator('.tracks-table:not(.notifications-similar) > tbody > tr.track .similarity-cell')
  await waitForWithTimeoutMessage(
    () => cells.first().waitFor({ state: 'visible', timeout: 20000 }),
    'Find similar should list the results with their audio distance.',
  )
  expect(await page.locator('.tracks-table-header').first().textContent()).to.contain('Diff')
  const figures = (await cells.allTextContents()).map((text) => text.trim())
  for (const figure of figures) expect(figure).to.match(/^\d+\.\d$/)
  // The played track is its own closest result, and the others are no longer all shown as 0
  expect(figures[0]).to.equal('0.0')
  expect(figures.some((figure) => Number(figure) > 0)).to.equal(true)
  // Point at each figure: in a recording this holds the results on screen before the next step moves on
  for (let i = 0; i < figures.length; i++) await cells.nth(i).hover()
}

module.exports = {
  assertSimilaritySearchShowsDistance,
  assertSoundsLikeShowsTrackInfo,
  assertOpeningASampleClosesTheOther,
  assertMatchesAndSoundsLikeToggle,
  assertCancelledDeleteKeepsSample,
  assertConfirmedDeleteRemovesSample,
  assertLinkOpensSample,
  assertPhoneLayoutFits,
  assertMatchListed,
  assertPlayDoesNotOpenSample,
  assertFollowingASuggestionRemovesIt,
}

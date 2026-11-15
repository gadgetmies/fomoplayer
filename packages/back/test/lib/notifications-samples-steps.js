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

// Every sample is closed on arrival; opening one shows its content under its row, opening another closes it
const assertOpeningASampleClosesTheOther = async ({ page }) => {
  await openSamplesTab(page)
  expect(await isOpen(page, SAMPLES.matched), 'no sample should be open when the tab opens').to.equal(false)
  expect(await page.locator('.notifications-sample_content').count()).to.equal(0)
  await openSample(page, SAMPLES.matched)

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
  await row
    .locator('.notifications-sample_content', { hasText: /Similar tracks appear|closest to the sample/ })
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
  expect(await page.locator('.notifications-sample_content').count(), 'an unknown id should open no sample').to.equal(0)
}

// On a phone the tab fits the screen: no sideways scrolling, and the toggle gets a line of its own in the header
const assertPhoneLayoutFits = async ({ mobilePage }) => {
  await openSamplesTab(mobilePage)
  await openSample(mobilePage, SAMPLES.matched)
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

// Local only: the DB-seeded match shows in Matches, as a two-line row on the phone
const assertMatchListed = async ({ page, mobilePage }) => {
  await openSamplesTab(page)
  await openSample(page, SAMPLES.matched)
  const match = sampleRow(page, SAMPLES.matched).locator('.notifications-matches .notifications-list_row').first()
  await match.waitFor({ state: 'visible', timeout: 10000 })
  expect(await match.locator('.notifications-list_title').textContent()).to.contain(ONE_PLAYER_TITLES[2])
  expect(await match.locator('.tempo').textContent()).to.equal('±0.0 %')

  await openSamplesTab(mobilePage)
  await openSample(mobilePage, SAMPLES.matched)
  const phoneMatch = sampleRow(mobilePage, SAMPLES.matched)
    .locator('.notifications-matches .notifications-list_row')
    .first()
  await phoneMatch.waitFor({ state: 'visible', timeout: 10000 })
  const box = await phoneMatch.boundingBox()
  expect(box.height, 'a match on a phone is a two-line row').to.be.at.least(56)
  expect(await mobilePage.locator('.notifications-matches .notifications-list_header').isVisible()).to.equal(false)
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
  await row.locator('.notifications-similar .notifications-list_row').first().waitFor({ timeout: 10000 })
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

module.exports = {
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

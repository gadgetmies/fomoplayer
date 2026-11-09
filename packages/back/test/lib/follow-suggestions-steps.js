// Shared browser steps and assertions for the follow-suggestions demo tests.
// Imported verbatim by both the -local and -preview entry files so the only
// difference between the two is how the purchased tracks are seeded.

const { expect } = require('chai')
const { waitForWithTimeoutMessage, dismissOnboarding } = require('./setup')
const { restoreSuggestionViaApi } = require('./follow-suggestions-seed')

const SUGGESTION = '[data-test="follow-suggestion"]'

const gotoFollowSuggestions = async (page) => {
  await page.goto('/settings/following')
  await waitForWithTimeoutMessage(
    () => page.waitForSelector('.settings-container', { timeout: 15000 }),
    'Render the settings container before checking follow suggestions.',
  )
  await dismissOnboarding(page)
  await waitForWithTimeoutMessage(
    () => page.waitForSelector('[data-test="follow-suggestions"]', { timeout: 15000 }),
    'Render the follow-suggestions section seeded from the purchased cart.',
  )
}

// The suggestions list renders the artists/labels behind purchased tracks, each
// with a Follow and an Ignore control; dismissing one removes it from the list.
const assertSuggestionsRenderAndIgnore = async ({ page }) => {
  await page.waitForSelector(SUGGESTION, { timeout: 15000 })

  const countBefore = await page.locator(SUGGESTION).count()
  expect(countBefore, 'at least one follow suggestion from purchased tracks').to.be.greaterThan(0)

  // Every suggestion offers both a Follow and an Ignore control.
  expect(await page.locator(`${SUGGESTION} [data-test="follow-suggestion-follow"]`).count()).to.equal(countBefore)
  expect(await page.locator(`${SUGGESTION} [data-test="follow-suggestion-ignore"]`).count()).to.equal(countBefore)

  const first = page.locator(SUGGESTION).first()
  const type = await first.getAttribute('data-test-suggestion-type')
  const id = await first.getAttribute('data-test-suggestion-id')
  const name = await first.getAttribute('data-test-suggestion-name')
  expect(name, 'dismissed suggestion has a name').to.be.a('string').and.not.empty

  await first.locator('[data-test="follow-suggestion-ignore"]').click()

  // The dismissed suggestion disappears from the list.
  await waitForWithTimeoutMessage(
    () =>
      page.waitForSelector(`${SUGGESTION}[data-test-suggestion-name="${name}"]`, { state: 'detached', timeout: 10000 }),
    `Remove the dismissed suggestion "${name}" from the list after clicking ignore.`,
  )
  const countAfter = await page.locator(SUGGESTION).count()
  expect(countAfter, 'dismissing a suggestion removes exactly one entry').to.equal(countBefore - 1)

  // Keep the persistent preview re-run safe by undoing the dismissal we just
  // made, so the next run still sees a full set of suggestions.
  await restoreSuggestionViaApi(page, type, id)
}

module.exports = { gotoFollowSuggestions, assertSuggestionsRenderAndIgnore }

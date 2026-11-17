const { expect } = require('chai')
const { dismissOnboarding, waitForWithTimeoutMessage } = require('./setup')

// Shared steps for the entity-search-terms demo: names of several words typed after artist: / label: stay in the
// lookup (space and quotes do not end the term), a name nothing matches says so, a picked match becomes a pill, and in Notifications › Subscriptions
// several picked pills are added as one subscription. The names come from the Concussion fixture the one-player seed
// adds (Noisia on Vision Recordings).

const ARTIST = 'Noisia'
const LABEL = 'Vision Recordings'
const COMBINED_NAME = `${ARTIST} · ${LABEL}`
const NO_MATCH = 'Nosuch Artist Atall'

const pillNames = (page, barSelector) => page.locator(`${barSelector} .search_pill .search_pill_name`).allTextContents()

// Types a lookup, checks no pill was added while typing (space stayed in the name) and picks the suggestion by name
const pickFromLookup = async (page, barSelector, typed, name, pick) => {
  const input = page.locator(`${barSelector} input`)
  const pillsBefore = await pillNames(page, barSelector)
  await input.pressSequentially(typed, { delay: 60 })
  expect(await input.inputValue()).to.equal(typed)
  expect(await pillNames(page, barSelector)).to.deep.equal(pillsBefore)
  const suggestion = page.locator(`${barSelector} .search_genre_option`, { hasText: name })
  await waitForWithTimeoutMessage(
    () => suggestion.first().waitFor({ state: 'visible', timeout: 10000 }),
    `Typing ${typed} should suggest ${name}.`,
  )
  await pick(suggestion.first(), input)
  await waitForWithTimeoutMessage(
    () =>
      page.waitForFunction(
        ({ selector, name }) =>
          Array.from(document.querySelectorAll(`${selector} .search_pill_name`)).some((pill) => pill.textContent === name),
        { selector: barSelector, name },
        { timeout: 10000 },
      ),
    `Picking ${name} should add it as a pill.`,
  )
  expect(await input.inputValue()).to.equal('')
}

const clickSuggestion = (suggestion) => suggestion.click()
// The first match is preselected, so Enter picks it
const pickWithKeyboard = (_suggestion, input) => input.press('Enter')

// A name of several words that matches nothing: the popup says so, and Enter adds nothing
const assertNoMatchSaysSo = async (page, barSelector, typed, message) => {
  const input = page.locator(`${barSelector} input`)
  const pillsBefore = await pillNames(page, barSelector)
  await input.pressSequentially(typed, { delay: 40 })
  await waitForWithTimeoutMessage(
    () =>
      page.waitForFunction(
        ({ selector, message }) =>
          document.querySelector(`${selector} [data-testid="entity-search-status"]`)?.textContent.includes(message),
        { selector: barSelector, message },
        { timeout: 10000 },
      ),
    `Typing ${typed} should say "${message}".`,
  )
  await input.press('Enter')
  expect(await pillNames(page, barSelector)).to.deep.equal(pillsBefore)
  expect(await input.inputValue()).to.equal(typed)
  await input.fill('')
}

const openTopBarSearch = async (page) => {
  await page.goto('/tracks/recent')
  await page.waitForSelector('.menu_search input', { state: 'visible', timeout: 20000 })
  await dismissOnboarding(page)
}

// Top bar: a label of two words, typed plainly, and an artist in quotes, then searched for together
const assertTopBarKeepsSpacesInLookup = async ({ page }) => {
  const bar = '.menu_search'
  await page.locator(`${bar} input`).click()
  await assertNoMatchSaysSo(page, bar, `artist:${NO_MATCH}`, `No artists match “${NO_MATCH}”`)
  await pickFromLookup(page, bar, `label:${LABEL}`, LABEL, clickSuggestion)
  await pickFromLookup(page, bar, `artist:"${ARTIST}"`, ARTIST, pickWithKeyboard)
  await page.locator(`${bar} input`).press('Enter')
  await waitForWithTimeoutMessage(
    () =>
      page.waitForFunction(
        () => /label:\d+/.test(decodeURIComponent(location.href)) && /artist:\d+/.test(decodeURIComponent(location.href)),
        null,
        { timeout: 10000 },
      ),
    'Searching should filter by the picked label and artist.',
  )
}

const openSubscriptions = async (page) => {
  await page.goto('/notifications/subscriptions')
  await page.waitForSelector('.notifications-add-search', { state: 'visible', timeout: 10000 })
  await page.waitForFunction(() => !document.querySelector('.notifications-add-search input')?.disabled, null, {
    timeout: 10000,
  })
}

// Subscriptions: picking does not subscribe; the artist and the quoted label are added as one search with Add
const assertSubscriptionCombinesPickedPills = async ({ page }) => {
  await openSubscriptions(page)
  const bar = '.notifications-add-search'
  await assertNoMatchSaysSo(page, bar, `label:"${NO_MATCH}"`, `No labels match “${NO_MATCH}”`)
  const combined = page.locator('[data-group="searches"] .notifications-subscription', { hasText: COMBINED_NAME })
  // A previous run on the persistent preview may have left the subscription: start without it
  if (await combined.count()) {
    await combined.first().locator('button.followed-item_bell').click()
    await combined.first().waitFor({ state: 'detached', timeout: 10000 })
  }

  await pickFromLookup(page, bar, `artist:${ARTIST}`, ARTIST, clickSuggestion)
  expect(await combined.count()).to.equal(0)
  await pickFromLookup(page, bar, `label:"${LABEL}"`, LABEL, pickWithKeyboard)
  expect(await combined.count()).to.equal(0)

  await page.locator('.notifications-add-search_button').click()
  await waitForWithTimeoutMessage(
    () => combined.first().waitFor({ state: 'visible', timeout: 10000 }),
    `The combined subscription should appear under Searches as "${COMBINED_NAME}".`,
  )
  expect(await pillNames(page, bar)).to.deep.equal([])

  // Its bell removes it again
  await combined.first().locator('button.followed-item_bell').click()
  await combined.first().waitFor({ state: 'detached', timeout: 10000 })
}

module.exports = {
  openTopBarSearch,
  openSubscriptions,
  assertTopBarKeepsSpacesInLookup,
  assertSubscriptionCombinesPickedPills,
  COMBINED_NAME,
}

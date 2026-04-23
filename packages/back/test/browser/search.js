const { expect } = require('chai')
const { test } = require('cascade-test')
const { getSharedContext, dismissOnboarding, waitForWithTimeoutMessage } = require('../lib/setup')
const { seedTracks } = require('../lib/seed')
const { resolveTestUserId } = require('../lib/test-user')

const getSearchQueryTerms = (pageUrl) => {
  const q = new URL(pageUrl).searchParams.get('q') || ''
  return q.split(/\s+/).filter(Boolean)
}

const getTrackTitles = async (page) => {
  const titles = await page.locator('.track .title-cell').allTextContents()
  return titles.map((title) => title.trim()).filter(Boolean)
}

const openDiscoverTracksPage = async (page) => {
  await page.goto('/tracks/recent')
  await waitForWithTimeoutMessage(
    () => page.waitForSelector('.tracks-table .track', { timeout: 5000 }),
    'Load new discover tracks before clicking an entity link.',
  )
}

const clickFirstPreviewEntityLink = async (page, entityType) => {
  await page.locator('.track').first().click()
  const entityLink = page.locator(`.preview_detail a[href*="/search?q=${entityType}:"]`).first()
  await waitForWithTimeoutMessage(
    () => entityLink.waitFor({ state: 'visible', timeout: 5000 }),
    'Find a preview entity link before triggering filtered search.',
  )
  const href = await entityLink.getAttribute('href')
  const expectedTerm = href?.match(new RegExp(`q=(${entityType}:\\d+)`))?.[1]
  expect(expectedTerm).to.match(new RegExp(`^${entityType}:\\d+$`))
  await entityLink.click()
  await waitForWithTimeoutMessage(
    () => page.waitForURL(/\/search/, { timeout: 5000 }),
    'Navigate to search results after clicking an entity link.',
  )
  return expectedTerm
}

test({
  setup: async () => {
    const { page } = await getSharedContext()
    const userId = await resolveTestUserId()
    await seedTracks({ userIds: [userId] })
    await page.goto('/tracks/recent')
    await waitForWithTimeoutMessage(
      () => page.waitForSelector('.tracks-table', { timeout: 15000 }),
      'Load the tracks table before running search behavior checks.',
    )
    await dismissOnboarding(page)
    return { page, timeout: 30000 }
  },
  
  'typing a query navigates to search route': async ({ page }) => {
    await page.goto('/tracks/recent')
    await waitForWithTimeoutMessage(
      () => page.waitForSelector('.tracks-table', { timeout: 15000 }),
      'Load tracks page before submitting a search query.',
    )
    await page.locator('.search_input_pills').first().fill('noisia')
    await page.locator('.search_input_pills').first().press('Enter')
    await waitForWithTimeoutMessage(
      () => page.waitForURL(/\/search/, { timeout: 5000 }),
      'Navigate to the search route after submitting the query.',
    )
    expect(page.url()).to.include('/search')
  },

  'clicking an entity link sets search query term': async ({ page }) => {
    await openDiscoverTracksPage(page)
    const expectedTerm = await clickFirstPreviewEntityLink(page, 'release')
    const terms = getSearchQueryTerms(page.url())
    expect(terms).to.deep.equal([expectedTerm])
  },

  'clicking an entity link refreshes discover results': async ({ page }) => {
    await openDiscoverTracksPage(page)
    const initialTitles = await getTrackTitles(page)
    expect(initialTitles.length).to.be.greaterThan(1)
    await clickFirstPreviewEntityLink(page, 'release')

    await waitForWithTimeoutMessage(
      () =>
        page.waitForFunction(
          ({ initialTitles }) => {
            const currentTitles = Array.from(document.querySelectorAll('.track .title-cell')).map((node) =>
              node.textContent.trim(),
            )
            return currentTitles.length > 0 && JSON.stringify(currentTitles) !== JSON.stringify(initialTitles)
          },
          { initialTitles },
          { timeout: 5000 },
        ),
      'Wait for track rows to change from discover state to filtered search results.',
    )
  },

  'shift-clicking a label entity link appends to existing search terms': async ({ page }) => {
    await page.goto('/tracks/recent')
    await waitForWithTimeoutMessage(
      () => page.waitForSelector('.tracks-table .track', { timeout: 5000 }),
      'Load discover tracks before building shift-click search query terms.',
    )
    const artistLink = page.locator('.track .artist-cell a').first()
    await waitForWithTimeoutMessage(
      () => artistLink.waitFor({ state: 'visible', timeout: 5000 }),
      'Find an artist entity link before creating a base search term.',
    )
    const artistHref = await artistLink.getAttribute('href')
    const expectedArtistTerm = artistHref?.match(/q=(artist:\d+)/)?.[1]
    expect(expectedArtistTerm).to.match(/^artist:\d+$/)
    await artistLink.click()

    await waitForWithTimeoutMessage(
      () => page.waitForURL(/\/search/, { timeout: 5000 }),
      'Wait for search page after clicking the first entity link.',
    )

    const labelLink = page.locator('.track .label-cell a').first()
    await waitForWithTimeoutMessage(
      () => labelLink.waitFor({ state: 'visible', timeout: 5000 }),
      'Find a label entity link on search results before shift-click append.',
    )

    const labelHref = await labelLink.getAttribute('href')
    const expectedLabelTerm = labelHref?.match(/q=(label:\d+)/)?.[1]
    expect(expectedLabelTerm).to.match(/^label:\d+$/)

    await labelLink.click({ modifiers: ['Shift'] })
    await waitForWithTimeoutMessage(
      () => page.waitForURL(/\/search/, { timeout: 5000 }),
      'Refresh search URL after shift-clicking a label link to append term.',
    )

    const terms = getSearchQueryTerms(page.url())
    expect(terms).to.deep.equal([expectedArtistTerm, expectedLabelTerm])
  },
})

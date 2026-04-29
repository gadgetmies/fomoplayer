// Demo walkthrough used by .github/workflows/pr-demo.yml. Runs against the
// Railway PR preview with slow-mo, video, and Playwright tracing enabled, so
// the recorded artifacts read as a guided tour rather than an assertion log.
// Asserts only the milestones that prove each step actually happened — anything
// finer-grained belongs in the dedicated browser tests next door.

const { expect } = require('chai')
const { test } = require('cascade-test')
const { getSharedContext, dismissOnboarding, waitForWithTimeoutMessage } = require('../lib/setup')
const { seedTracks } = require('../lib/seed')
const { resolveTestUserId } = require('../lib/test-user')

const cartButton = (page) => page.locator('.preview_actions_wrapper .button-drop_down-left').first()
const playButton = (page) => page.locator('.button-playback').first()
const pauseIcon = (page) => page.locator('.button-playback svg[data-icon="pause"]').first()
const playIcon = (page) => page.locator('.button-playback svg[data-icon="play"]').first()

test({
  setup: async () => {
    const { page } = await getSharedContext()
    const userId = await resolveTestUserId()
    await seedTracks({ userIds: [userId] })
    await page.goto('/tracks/recent')
    await waitForWithTimeoutMessage(
      () => page.waitForSelector('.tracks-table', { timeout: 15000 }),
      'Load the tracks table before starting the demo walkthrough.',
    )
    await dismissOnboarding(page)
    return { page, timeout: 60000 }
  },

  'walkthrough: select, play, pause, add to cart, open cart': async ({ page }) => {
    await page.goto('/tracks/recent')
    await waitForWithTimeoutMessage(
      () => page.waitForSelector('.tracks-table', { timeout: 15000 }),
      'Land on the recent tracks page for the demo walkthrough.',
    )

    const targetTrack = page.locator('.track').nth(1)
    await targetTrack.click()
    await waitForWithTimeoutMessage(
      () =>
        page.waitForFunction(
          () => document.querySelectorAll('.track')[1]?.classList.contains('selected'),
          { timeout: 10000 },
        ),
      'Wait for the chosen track to enter the selected state.',
    )
    const selectedTitle = (await targetTrack.locator('.title-cell').first().innerText()).trim()
    expect(selectedTitle.length).to.be.greaterThan(0)

    await playButton(page).click()
    await waitForWithTimeoutMessage(
      () => pauseIcon(page).waitFor({ timeout: 10000 }),
      'Wait for playback to start (pause icon appears once audio is playing).',
    )

    await playButton(page).click()
    await waitForWithTimeoutMessage(
      () => playIcon(page).waitFor({ timeout: 10000 }),
      'Wait for playback to pause (play icon returns).',
    )

    const cartTitleBefore = (await cartButton(page).getAttribute('title')) || ''
    if (cartTitleBefore.toLowerCase().includes('remove')) {
      await cartButton(page).click()
      await waitForWithTimeoutMessage(
        () =>
          page.waitForFunction(
            () =>
              document
                .querySelector('.preview_actions_wrapper .button-drop_down-left')
                ?.getAttribute('title')
                ?.toLowerCase()
                .includes('add to default cart'),
            { timeout: 10000 },
          ),
        'Reset cart membership so the demo always exercises the add path.',
      )
    }

    await cartButton(page).click()
    await waitForWithTimeoutMessage(
      () =>
        page.waitForFunction(
          () =>
            document
              .querySelector('.preview_actions_wrapper .button-drop_down-left')
              ?.getAttribute('title')
              ?.toLowerCase()
              .includes('remove from default cart'),
          { timeout: 10000 },
        ),
      'Wait for the cart button to flip to the "remove" state, confirming the add succeeded.',
    )

    const cartsNavButton = page.locator('.menu_left a, .menu_left button').filter({ hasText: 'Carts' }).first()
    await cartsNavButton.click()
    await waitForWithTimeoutMessage(
      () => page.waitForURL(/\/carts\/[^/]+/, { timeout: 10000 }),
      'Navigate to the default cart route.',
    )
    await waitForWithTimeoutMessage(
      () =>
        page.waitForFunction(
          () => document.querySelector('.cart-details')?.textContent?.includes('Tracks in cart:'),
          { timeout: 10000 },
        ),
      'Wait for the cart details header to render.',
    )

    const cartTitles = (await page.locator('.track .title-cell').allInnerTexts()).map((t) => t.trim())
    expect(cartTitles).to.include(selectedTitle)
  },
})

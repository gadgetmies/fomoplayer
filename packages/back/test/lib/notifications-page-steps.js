const { expect } = require('chai')
const { dismissOnboarding, waitForWithTimeoutMessage } = require('./setup')
const { followedArtistName } = require('./follow-popup-seed')
const { SAMPLE_FILENAME, SAMPLE_MATCH_OFFSET_SECONDS } = require('./notifications-page-seed')

// Shared browser interactions/assertions for the notifications-page demo. The preview (demo-preview) entry runs the
// common steps; the local (demo-test) entry runs the same steps plus the ones that need DB-seeded notification events.

const DEMO_SEARCH = 'notifications page demo'
const audioTime = (page) => page.$eval('audio', (audio) => audio.currentTime)
const audioIsPlaying = (page) =>
  page.waitForFunction(
    () => {
      const audio = document.querySelector('audio')
      return audio && !audio.paused && audio.currentTime > 0.5
    },
    null,
    { timeout: 20000 },
  )

const openNotificationsFromTopBar = async (page) => {
  await page.goto('/tracks/recent')
  await waitForWithTimeoutMessage(
    () => page.waitForSelector('a[href="/notifications/activity"]', { timeout: 20000 }),
    'The top bar should link to Notifications.',
  )
  await dismissOnboarding(page)
  await page.locator('a[href="/notifications/activity"]').first().click()
  await page.waitForSelector('.notifications-page', { state: 'visible', timeout: 10000 })
}

const assertActivityTabOpens = async ({ page }) => {
  expect(page.url()).to.match(/\/notifications\/activity$/)
  const selected = await page.locator('.notifications-tabs [aria-selected="true"]').textContent()
  expect(selected).to.match(/^Activity/)
  // Either the feed or the explanation of where notifications come from
  await page.waitForSelector('.notifications-activity, .notifications-empty', { timeout: 10000 })
}

const openTab = async (page, label) => {
  await page.locator('.notifications-tabs a', { hasText: label }).click()
  await page.waitForSelector(`.notifications-tabs [aria-selected="true"]:has-text("${label}")`, { timeout: 5000 })
}

const assertSubscriptionsAddAndRemove = async ({ page }) => {
  await openTab(page, 'Subscriptions')
  const input = page.locator('.notifications-add-search input')
  await input.fill(DEMO_SEARCH)
  await page.locator('.notifications-add-search button[type="submit"]').click()
  const item = page.locator('.notifications-subscription', { hasText: DEMO_SEARCH })
  await waitForWithTimeoutMessage(
    () => item.waitFor({ state: 'visible', timeout: 10000 }),
    'An added search should appear under Searches with its bell on.',
  )
  expect(await item.locator('button').getAttribute('aria-pressed')).to.equal('true')
  await item.locator('button').click()
  await waitForWithTimeoutMessage(
    () => item.waitFor({ state: 'detached', timeout: 10000 }),
    'Turning the bell off should remove the subscription.',
  )
}

const assertFollowingBellSubscribesArtist = async ({ page }) => {
  await page.locator('a[href="/settings/following"]').first().click()
  await page.waitForSelector('.settings-container', { state: 'visible', timeout: 10000 })
  const bell = page
    .locator('.follow-list li', { hasText: followedArtistName })
    .first()
    .locator('button.followed-item_bell')
  await waitForWithTimeoutMessage(
    () => bell.waitFor({ state: 'visible', timeout: 10000 }),
    `The followed artist ${followedArtistName} should have a notify bell.`,
  )
  if ((await bell.getAttribute('aria-pressed')) === 'true') {
    await bell.click()
    await page.waitForFunction((el) => el.getAttribute('aria-pressed') === 'false', await bell.elementHandle())
  }
  await bell.click()
  await page.waitForFunction((el) => el.getAttribute('aria-pressed') === 'true', await bell.elementHandle(), {
    timeout: 10000,
  })

  // The artist now shows under Notifications › Subscriptions › Artists; turn it off again from there
  await page.locator('a[href="/notifications/activity"]').first().click()
  await openTab(page, 'Subscriptions')
  const item = page.locator('.notifications-subscription', { hasText: followedArtistName })
  await waitForWithTimeoutMessage(
    () => item.waitFor({ state: 'visible', timeout: 10000 }),
    `${followedArtistName} should be listed under Artists after turning on its bell.`,
  )
  await item.locator('button').click()
  await item.waitFor({ state: 'detached', timeout: 10000 })
}

const assertSettingsEmailTab = async ({ page }) => {
  await page.locator('a[href="/settings/following"]').first().click()
  await page.locator('label[for="settings-state-email"]').click()
  await page.waitForURL(/\/settings\/email$/, { timeout: 5000 })
  expect(await page.locator('label[for="settings-state-email"]').textContent()).to.equal('Email')
  await page.waitForSelector('input[type="email"]', { state: 'visible', timeout: 5000 })
  expect(await page.locator('.settings-email-pointer a').getAttribute('href')).to.equal('/notifications/subscriptions')
}

// Local only: needs DB-seeded events
const assertUnreadBadge =
  (expected) =>
  async ({ page }) => {
    await page.goto('/tracks/recent')
    try {
      await page.waitForFunction(
        (count) => document.querySelector('[data-testid="notifications-unread-count"]')?.textContent === String(count),
        expected,
        { timeout: 15000 },
      )
    } catch {
      const api = await page.evaluate(async () => {
        const r = await fetch('/api/me/notifications/events/unread-count', { credentials: 'same-origin' })
        return `${r.status} ${await r.text()}`
      })
      const badge = await page
        .locator('[data-testid="notifications-unread-count"]')
        .textContent({ timeout: 1000 })
        .catch(() => 'none')
      throw new Error(`The bell should show ${expected} unread notifications; badge: ${badge}, API: ${api}`)
    }
  }

const unreadCount = (page) =>
  page.$eval('[data-testid="notifications-unread-count"]', (el) => Number(el.textContent)).catch(() => 0)

const assertPlayingActivityRowReadsIt = async ({ page }) => {
  await page.locator('a[href="/notifications/activity"]').first().click()
  const row = page.locator('.notifications-activity tbody tr[data-unread="true"]').first()
  await row.waitFor({ state: 'visible', timeout: 10000 })
  const before = await unreadCount(page)
  await row.click()
  await waitForWithTimeoutMessage(() => audioIsPlaying(page), 'Clicking an Activity row should play its track.')
  expect(await page.locator('.preview_details_wrapper .preview_playing-from').textContent()).to.contain(
    'Notifications · Activity',
  )
  await waitForWithTimeoutMessage(
    () =>
      page.waitForFunction(
        (previous) =>
          Number(document.querySelector('[data-testid="notifications-unread-count"]')?.textContent || 0) < previous,
        before,
        { timeout: 15000 },
      ),
    'Playing an unread notification should lower the unread count.',
  )
}

const assertSampleMatchPlaysAligned = async ({ page }) => {
  await openTab(page, 'Samples')
  await page.locator('.notifications-samples tr', { hasText: SAMPLE_FILENAME }).click()
  const matchRow = page.locator('.notifications-matches tbody tr').first()
  await matchRow.waitFor({ state: 'visible', timeout: 10000 })
  expect(await matchRow.locator('.tempo').textContent()).to.equal('±0.0 %')
  await matchRow.click()

  await page.waitForSelector('.preview_ab', { state: 'visible', timeout: 10000 })
  try {
    await page.waitForFunction(
      (offset) => {
        const audio = document.querySelector('audio')
        return audio && !audio.paused && audio.currentTime >= offset
      },
      SAMPLE_MATCH_OFFSET_SECONDS,
      { timeout: 20000 },
    )
  } catch {
    const state = await page.$eval('audio', (a) => ({
      t: a.currentTime,
      paused: a.paused,
      src: a.currentSrc,
      ready: a.readyState,
    }))
    throw new Error(`B should start where the sample matched; audio: ${JSON.stringify(state)}`)
  }
  await page.waitForTimeout(2000)

  // Switch to the sample: it continues from the same moment, i.e. preview time − offset
  const previewTime = await audioTime(page)
  await page.locator('.preview_ab-option', { hasText: 'A · Your sample' }).click()
  await waitForWithTimeoutMessage(
    () =>
      page.waitForFunction(() => document.querySelector('audio')?.currentSrc.includes('sample=1'), null, {
        timeout: 10000,
      }),
    'A should play the sample.',
  )
  try {
    await audioIsPlaying(page)
  } catch {
    const state = await page.$eval('audio', (a) => ({
      t: a.currentTime,
      paused: a.paused,
      src: a.currentSrc,
      ready: a.readyState,
      error: a.error?.code,
    }))
    throw new Error(`A should play the sample from the matched moment; audio: ${JSON.stringify(state)}`)
  }
  expect(await audioTime(page)).to.be.closeTo(previewTime - SAMPLE_MATCH_OFFSET_SECONDS, 3)

  // And back to the match on the same beat
  const sampleTime = await audioTime(page)
  await page.locator('.preview_ab-option', { hasText: 'B · Match' }).click()
  await page.waitForFunction(() => !document.querySelector('audio')?.currentSrc.includes('sample=1'), null, {
    timeout: 10000,
  })
  await audioIsPlaying(page)
  expect(await audioTime(page)).to.be.closeTo(SAMPLE_MATCH_OFFSET_SECONDS + sampleTime, 3)
}

module.exports = {
  openNotificationsFromTopBar,
  assertActivityTabOpens,
  assertSubscriptionsAddAndRemove,
  assertFollowingBellSubscribesArtist,
  assertSettingsEmailTab,
  assertUnreadBadge,
  assertPlayingActivityRowReadsIt,
  assertSampleMatchPlaysAligned,
}

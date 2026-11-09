// Shared, environment-agnostic browser steps for the no-login unsubscribe page
// demo. Both the -local and -preview entry files use these verbatim; only the
// seeding of the unsubscribe URL differs (and even that is shared here — see
// email-unsubscribe-seed.js). Drives the real user flow: land on the branded
// confirmation page, unsubscribe, then resubscribe.

const { waitForWithTimeoutMessage } = require('./setup')

// Navigate to the no-login unsubscribe page on the current origin (the running
// app/backend), so the same code reaches it on local and preview regardless of
// any configured absolute API host.
const gotoUnsubscribePage = async (page, token) => {
  const origin = new URL(page.url()).origin
  const url = `${origin}/api/email/unsubscribe?token=${encodeURIComponent(token)}`
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await waitForWithTimeoutMessage(
    () => page.waitForSelector('text=Unsubscribe from all emails?', { timeout: 30000 }),
    'Branded unsubscribe confirmation page did not render',
  )
}

// The flow ends in the resubscribed state, so re-running against the shared
// preview leaves no lasting suppression (re-run safe).
const assertUnsubscribeAndResubscribe = async ({ page }) => {
  // Confirm page is shown and has NOT mutated anything yet.
  await waitForWithTimeoutMessage(
    () => page.waitForSelector('#unsub-btn', { timeout: 30000 }),
    'Unsubscribe confirm button not found',
  )

  // Opt out.
  await page.click('#unsub-btn')
  await waitForWithTimeoutMessage(
    () => page.waitForSelector('text=You are unsubscribed', { timeout: 30000 }),
    'Unsubscribe confirmation did not appear after clicking Unsubscribe',
  )

  // Opt back in (leaves the shared preview clean for the next run).
  await page.click('text=Resubscribe')
  await waitForWithTimeoutMessage(
    () => page.waitForSelector('text=You are resubscribed', { timeout: 30000 }),
    'Resubscribe confirmation did not appear after clicking Resubscribe',
  )
}

module.exports = { gotoUnsubscribePage, assertUnsubscribeAndResubscribe }

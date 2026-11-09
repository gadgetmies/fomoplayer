// Browser steps shared by the local and preview error boundary demo tests. ?crashTest=1 makes
// the front end throw during render inside the app's error boundary; the steps check that the
// fallback replaces the blank page and that the error reaches POST /api/log/error.

const { expect } = require('chai')
const { waitForWithTimeoutMessage } = require('./setup')

const crashAndAssertFallback = async ({ page }) => {
  const logRequest = page.waitForRequest(
    (r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/log/error',
    { timeout: 15000 },
  )
  // Keep a timeout here from surfacing as an unhandled rejection if an earlier step fails.
  logRequest.catch(() => {})
  await page.goto('/tracks/recent?crashTest=1')

  await waitForWithTimeoutMessage(
    () => page.getByRole('alert').getByText('Something went wrong').waitFor({ timeout: 15000 }),
    'Show the error fallback after a render error instead of an empty page.',
  )
  expect(await page.getByRole('button', { name: 'Reload' }).isVisible()).to.equal(true)

  const request = await waitForWithTimeoutMessage(() => logRequest, 'Report the render error to POST /api/log/error.')
  const body = request.postDataJSON()
  expect(body.error.message).to.contain('crash-test (front)')
  expect(body.error.stack).to.be.a('string')
  // Production builds minify component names, so only check that a stack was sent.
  expect(body.componentStack).to.be.a('string').and.not.be.empty
  const response = await request.response()
  expect(response.status()).to.equal(204)
}

const assertAppRecoversWithoutCrashParam = async ({ page }) => {
  await page.goto('/tracks/recent')
  await waitForWithTimeoutMessage(
    () => page.waitForSelector('.tracks-table', { timeout: 15000 }),
    'Render the app normally once ?crashTest is removed.',
  )
  expect(await page.getByText('Something went wrong').count()).to.equal(0)
}

module.exports = { crashAndAssertFallback, assertAppRecoversWithoutCrashParam }

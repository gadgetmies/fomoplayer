// Shared, environment-agnostic browser steps for the CLI login link reuse
// demo. Both the -local and -preview entry files use these verbatim. Drives the
// real flow the CLI starts: open the authorization link, allow access, land on
// the CLI's localhost callback, then open the same link again and see that it
// has already been used instead of the consent screen.

const crypto = require('crypto')
const http = require('http')
const { waitForWithTimeoutMessage } = require('./setup')

// Stands in for the CLI's one-shot callback listener. The browser runs on the
// same machine as the test process in both the local and the preview demo, so
// the redirect to http://localhost:<port>/ reaches it.
const startCallbackListener = async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end('<!DOCTYPE html><html><body><h1>CLI received the authorization code</h1></body></html>')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { port: server.address().port, close: () => new Promise((resolve) => server.close(resolve)) }
}

// A fresh challenge per run keeps the demo re-run safe on the persistent
// preview: each run's link is new, so the first open always shows consent.
const buildCliLoginLink = (page, callbackPort) => {
  const origin = new URL(page.url()).origin
  const verifier = crypto.randomBytes(32).toString('base64url')
  const url = new URL(`${origin}/api/auth/login/cli`)
  url.searchParams.set('callbackPort', String(callbackPort))
  url.searchParams.set('code_challenge', crypto.createHash('sha256').update(verifier).digest('base64url'))
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('state', crypto.randomBytes(16).toString('base64url'))
  return url.toString()
}

const assertLinkCannotBeReused = async ({ page, link }) => {
  await page.goto(link, { waitUntil: 'domcontentloaded' })
  await waitForWithTimeoutMessage(
    () => page.waitForSelector('text=Grant CLI access?', { timeout: 30000 }),
    'CLI consent screen did not render for a fresh authorization link',
  )

  await page.click('button:has-text("Allow")')
  await waitForWithTimeoutMessage(
    () => page.waitForSelector('text=CLI received the authorization code', { timeout: 30000 }),
    'Allowing access did not redirect to the CLI callback',
  )

  await page.goto(link, { waitUntil: 'domcontentloaded' })
  await waitForWithTimeoutMessage(
    () => page.waitForSelector('text=This link has already been used', { timeout: 30000 }),
    'Reopening an approved authorization link did not show the "already used" page',
  )
  if (await page.isVisible('text=Grant CLI access?')) {
    throw new Error('Consent screen was shown again for an approved authorization link')
  }
}

module.exports = { startCallbackListener, buildCliLoginLink, assertLinkCannotBeReused }

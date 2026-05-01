'use strict'

const http = require('http')
const { randomBytes, createHash } = require('crypto')
const { URL } = require('url')

const LOGIN_TIMEOUT_MS = 120_000

/**
 * Starts a local HTTP server, opens the browser to the CLI login URL (with
 * PKCE code_challenge + state), waits for the authorization code callback,
 * verifies the state, exchanges the code for a permanent API key, and returns
 * { key }.
 *
 * @param {string} apiUrl  - Base URL of the fomoplayer API.
 * @param {function} openBrowser - Called with the login URL string. May be null
 *   to skip auto-opening; in that case the user must paste the printed URL into
 *   a browser themselves.
 * @param {function} [printLine=console.log] - Used to print the auth URL and
 *   copy-paste hint. Override in tests.
 * @returns {Promise<{ key: string }>}
 */
async function login(apiUrl, openBrowser, printLine = (msg) => console.log(msg)) {
  const codeVerifier = randomBytes(32).toString('base64url')
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
  const state = randomBytes(16).toString('base64url')

  return new Promise((resolve, reject) => {
    let settled = false
    let timer = null

    const settle = (fn, value) => {
      if (settled) return
      settled = true
      if (timer !== null) clearTimeout(timer)
      server.close()
      fn(value)
    }

    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url, 'http://localhost')
        const code = reqUrl.searchParams.get('code')
        const returnedState = reqUrl.searchParams.get('state')

        if (!code || !returnedState) {
          res.writeHead(400)
          res.end('Missing code or state')
          return
        }

        if (returnedState !== state) {
          res.writeHead(400)
          res.end('State mismatch')
          settle(reject, new Error('State mismatch — possible CSRF'))
          return
        }

        let key
        try {
          const response = await fetch(`${apiUrl}/api/auth/cli-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, code_verifier: codeVerifier }),
          })
          if (!response.ok) {
            const text = await response.text()
            throw new Error(`Token exchange failed (${response.status}): ${text}`)
          }
          const data = await response.json()
          key = data.access_token
        } catch (fetchErr) {
          res.writeHead(500)
          res.end('Token exchange failed')
          settle(reject, fetchErr)
          return
        }

        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Logged in — Fomo Player</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #111; color: #eee; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #1c1c1c; border: 1px solid #333; border-radius: 12px; padding: 2rem; max-width: 440px; width: 100%; text-align: center; }
    h1 { font-size: 1.25rem; margin-bottom: 0.75rem; }
    p { color: #aaa; font-size: 0.9rem; line-height: 1.5; }
    .check { font-size: 2.5rem; margin-bottom: 1rem; color: #4caf50; }
  </style>
</head>
<body>
  <div class="card">
    <div class="check">✓</div>
    <h1>CLI login successful</h1>
    <p>You can close this tab and return to your terminal.</p>
  </div>
</body>
</html>`)

        settle(resolve, { key })
      } catch (err) {
        settle(reject, err)
      }
    })

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      const loginUrl = new URL(`${apiUrl}/api/auth/login/cli`)
      loginUrl.searchParams.set('callbackPort', String(port))
      loginUrl.searchParams.set('code_challenge', codeChallenge)
      loginUrl.searchParams.set('code_challenge_method', 'S256')
      loginUrl.searchParams.set('state', state)

      timer = setTimeout(() => {
        settle(reject, new Error('Login timed out after 120 seconds'))
      }, LOGIN_TIMEOUT_MS)

      const urlString = loginUrl.toString()
      printLine('')
      printLine('To log in, open this URL in your browser:')
      printLine('')
      printLine(`  ${urlString}`)
      printLine('')
      printLine('If your browser does not open automatically, or you would prefer to use a different browser, copy and paste the URL above.')
      printLine('Waiting for login to complete...')

      if (openBrowser) {
        Promise.resolve()
          .then(() => openBrowser(urlString))
          .catch(() => {
            printLine('Could not open a browser automatically. Please use the URL above.')
          })
      }
    })

    server.on('error', (err) => settle(reject, err))
  })
}

module.exports = { login }

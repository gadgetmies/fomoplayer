'use strict'

const http = require('http')
const { URL } = require('url')

const LOGIN_TIMEOUT_MS = 120_000

/**
 * Starts a local HTTP server, opens the browser to the CLI login URL, waits
 * for the OIDC callback containing a short-lived handoff token, exchanges it
 * for a permanent API key, and returns { key }.
 *
 * @param {string} apiUrl  - Base URL of the fomoplayer API.
 * @param {function} openBrowser - Called with the login URL string; in
 *   production this is `open` from the `open` package, but is injectable for
 *   testing.
 * @returns {Promise<{ key: string }>}
 */
async function login(apiUrl, openBrowser) {
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
        const token = reqUrl.searchParams.get('token')

        if (!token) {
          res.writeHead(400)
          res.end('Missing token')
          return
        }

        // Acknowledge the browser immediately so it does not hang
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('Login successful. You may close this tab.')

        // Exchange the handoff token for a persistent API key
        const exchangeRes = await fetch(`${apiUrl}/api/auth/api-keys/exchange-handoff`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, name: 'CLI' }),
        })

        if (!exchangeRes.ok) {
          const body = await exchangeRes.text().catch(() => '')
          settle(reject, new Error(`Token exchange failed (${exchangeRes.status}): ${body}`))
          return
        }

        const data = await exchangeRes.json()
        settle(resolve, { key: data.key })
      } catch (err) {
        settle(reject, err)
      }
    })

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      const loginUrl = `${apiUrl}/api/auth/login/cli?callbackPort=${port}`

      timer = setTimeout(() => {
        settle(reject, new Error('Login timed out after 120 seconds'))
      }, LOGIN_TIMEOUT_MS)

      openBrowser(loginUrl).catch((err) => settle(reject, err))
    })

    server.on('error', (err) => settle(reject, err))
  })
}

module.exports = { login }

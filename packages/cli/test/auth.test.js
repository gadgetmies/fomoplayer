'use strict'

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../../back/.env.test') })
process.env.NODE_ENV = process.env.NODE_ENV || 'test'

const { expect } = require('chai')
const { test } = require('cascade-test')

const { startServer } = require('../../back/test/lib/server')
const { hashApiKey } = require('../../back/db/api-key')
const { pg } = require('../../back/test/lib/db')

const { login } = require('../src/auth')

test({
  setup: async () => {
    const { server, port } = await startServer()
    const apiUrl = `http://localhost:${port}`
    return { server, apiUrl, timeout: 60000 }
  },
  teardown: async ({ server }) => {
    server.kill()
  },

  'login flow: PKCE code exchange returns an API key': {
    setup: async ({ server, apiUrl }) => {
      // Simulate the browser: authenticate, visit the CLI login page, confirm access.
      // Manually track the session cookie across requests.
      const openBrowser = async (loginUrl) => {
        const url = new URL(loginUrl)
        const callbackPort = url.searchParams.get('callbackPort')

        // Step 1: authenticate as the seeded test user
        const loginRes = await fetch(`${apiUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'testuser', password: 'testpwd' }),
          redirect: 'manual',
        })
        const sessionCookie = loginRes.headers.get('set-cookie')
        if (!sessionCookie) throw new Error('No session cookie after login')

        // Step 2: visit the CLI authorization page (passes PKCE params from loginUrl through)
        const cliPageRes = await fetch(loginUrl, {
          headers: { cookie: sessionCookie },
          redirect: 'manual',
        })
        if (cliPageRes.status !== 200) {
          throw new Error(`CLI login page returned ${cliPageRes.status}`)
        }

        // Step 3: submit the confirm form
        const confirmRes = await fetch(`${apiUrl}/api/auth/login/cli/confirm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            cookie: sessionCookie,
          },
          body: '',
          redirect: 'manual',
        })
        const location = confirmRes.headers.get('location')
        if (!location) throw new Error(`Confirm returned ${confirmRes.status} with no redirect`)

        // Step 4: follow the redirect to the CLI's local callback server
        const callbackRes = await fetch(location)
        if (!callbackRes.ok) {
          throw new Error(`Callback server responded with ${callbackRes.status}`)
        }
      }

      const result = await login(apiUrl, openBrowser)
      return { server, apiUrl, result }
    },
    teardown: async ({ result }) => {
      if (result?.key) {
        const hash = hashApiKey(result.key)
        await pg.queryAsync('DELETE FROM api_key WHERE api_key_hash = $1', [hash])
      }
    },
    'returns an API key starting with fp_': async ({ result }) => {
      expect(result).to.have.property('key')
      expect(result.key).to.be.a('string')
      expect(result.key).to.match(/^fp_/)
    },
  },
})

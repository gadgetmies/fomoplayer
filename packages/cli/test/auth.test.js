'use strict'

// Load the backend test environment so that OIDC_HANDOFF_SECRET, DATABASE_URL,
// CRYPTO_KEY, etc. are available — the same variables the backend server reads
// when it starts up in test mode.
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../../back/.env.test') })
process.env.NODE_ENV = process.env.NODE_ENV || 'test'

const { expect } = require('chai')
const { test } = require('cascade-test')

const { startServer } = require('../../back/test/lib/server')
const { mintHandoffToken } = require('../../back/routes/shared/auth-handoff-token')
const account = require('../../back/db/account')
const { hashApiKey } = require('../../back/db/api-key')
const { pg } = require('../../back/test/lib/db')

const { login } = require('../src/auth')

const HANDOFF_SECRET = process.env.OIDC_HANDOFF_SECRET
// The backend derives apiOrigin from API_URL env var: 'http://localhost' in .env.test
const API_ORIGIN = 'http://localhost'
const OIDC_ISSUER = 'accounts.google.com'
const OIDC_SUBJECT = 'test-subject-cli-auth-test'

test({
  setup: async () => {
    const { server, port } = await startServer()
    const apiUrl = `http://localhost:${port}`

    // Ensure a user with the test OIDC identity exists in the DB
    const user = await account.findOrCreateByIdentifier(OIDC_ISSUER, OIDC_SUBJECT)

    // Give the nested group (including inner setup + test) 60 seconds — server
    // startup and the DB migration round-trip can take a while on the first run.
    return { server, apiUrl, userId: user.id, timeout: 60000 }
  },
  teardown: async ({ server }) => {
    server.kill()
  },

  'login flow: starts HTTP listener and exchanges handoff token': {
    setup: async ({ server, apiUrl, userId }) => {
      // Mint a handoff token directly — this simulates what the backend would
      // do after a successful OIDC redirect for the CLI flow.
      // The backend's apiOrigin is 'http://localhost' (from API_URL in .env.test),
      // regardless of the actual port, so the token must be issued/audienced to
      // that origin.
      const { token } = mintHandoffToken({
        secret: HANDOFF_SECRET,
        issuer: API_ORIGIN,
        audience: API_ORIGIN,
        oidcIssuer: OIDC_ISSUER,
        oidcSubject: OIDC_SUBJECT,
      })

      // openBrowser mock: extracts the callback port from the login URL, then
      // immediately drives the local HTTP server with the minted token, exactly
      // as a real browser would after completing the OIDC flow.
      const openBrowser = async (loginUrl) => {
        const url = new URL(loginUrl)
        const callbackPort = url.searchParams.get('callbackPort')
        const callbackUrl = `http://localhost:${callbackPort}/?token=${encodeURIComponent(token)}`
        const res = await fetch(callbackUrl)
        if (!res.ok) {
          throw new Error(`Callback server responded with ${res.status}`)
        }
      }

      const result = await login(apiUrl, openBrowser)
      return { server, apiUrl, userId, result }
    },
    teardown: async ({ result, userId }) => {
      // Clean up the created API key from the database
      if (result?.key) {
        const hash = hashApiKey(result.key)
        await pg.queryAsync(
          'DELETE FROM api_key WHERE api_key_hash = $1 AND meta_account_user_id = $2',
          [hash, userId],
        )
      }
    },
    'returns an API key starting with fp_': async ({ result }) => {
      expect(result).to.have.property('key')
      expect(result.key).to.be.a('string')
      expect(result.key).to.match(/^fp_/)
    },
  },
})

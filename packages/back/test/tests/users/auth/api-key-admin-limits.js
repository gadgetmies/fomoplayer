'use strict'
const { expect } = require('chai')
const { test } = require('cascade-test')
const { startServer } = require('../../../lib/server')
const { mintHandoffToken } = require('../../../../routes/shared/auth-handoff-token')
const account = require('../../../../db/account')
const { pg } = require('../../../lib/db')

const ADMIN_API_KEY_RATE_LIMITS = require('../../../../db/api-key').ADMIN_API_KEY_RATE_LIMITS

const OIDC_ISSUER = 'accounts.google.com'
const ADMIN_SUBJECT = 'test-subject-admin-limits-admin'
const NON_ADMIN_SUBJECT = 'test-subject-admin-limits-nonadmin'

const HANDOFF_SECRET = process.env.OIDC_HANDOFF_SECRET

const mintToken = (apiOrigin, oidcSubject) =>
  mintHandoffToken({
    secret: HANDOFF_SECRET,
    issuer: apiOrigin,
    audience: apiOrigin,
    oidcIssuer: OIDC_ISSUER,
    oidcSubject,
  })

// Mint a key via /api-keys/exchange-handoff and return the stored row's limits.
const mintAndFetchLimits = async (baseUrl, oidcSubject) => {
  const { token } = mintToken(baseUrl, oidcSubject)
  const r = await fetch(`${baseUrl}/api/auth/api-keys/exchange-handoff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  expect(r.status).to.equal(200)
  const { id } = await r.json()
  const [row] = await pg.queryRowsAsync(
    `SELECT rate_limit_per_minute, rate_limit_per_day FROM api_key WHERE api_key_id = $1`,
    [id],
  )
  return row
}

test({
  // The minting account's OIDC subject is listed in ADMIN_USER_SUBS, so its
  // minted keys must receive the unlimited rate limits. ADMIN_USER_SUBS is read
  // at module load, so this case needs its own server process.
  'admin account mints a key with unlimited limits': {
    setup: async () => {
      const { server, port } = await startServer({
        env: {
          PREVIEW_ENV: 'true',
          PREVIEW_ALLOWED_GOOGLE_SUBS: ADMIN_SUBJECT,
          ADMIN_USER_SUBS: ADMIN_SUBJECT,
        },
      })
      const baseUrl = `http://localhost:${port}`
      const user = await account.findOrCreateByIdentifier(OIDC_ISSUER, ADMIN_SUBJECT)
      return { server, baseUrl, userId: user.id }
    },
    teardown: async ({ server, userId }) => {
      server.kill()
      await pg.queryAsync('DELETE FROM api_key WHERE meta_account_user_id = $1', [userId])
    },
    'stored key has unlimited per-minute and per-day limits': async ({ baseUrl }) => {
      const row = await mintAndFetchLimits(baseUrl, ADMIN_SUBJECT)
      expect(row.rate_limit_per_minute).to.equal(ADMIN_API_KEY_RATE_LIMITS.ratePerMinute)
      expect(row.rate_limit_per_day).to.equal(ADMIN_API_KEY_RATE_LIMITS.ratePerDay)
    },
  },

  // The minting account's OIDC subject is NOT in ADMIN_USER_SUBS, so its minted
  // key must fall back to the table defaults (60/1000).
  'non-admin account mints a key with default limits': {
    setup: async () => {
      const { server, port } = await startServer({
        env: {
          PREVIEW_ENV: 'true',
          PREVIEW_ALLOWED_GOOGLE_SUBS: NON_ADMIN_SUBJECT,
          ADMIN_USER_SUBS: '',
        },
      })
      const baseUrl = `http://localhost:${port}`
      const user = await account.findOrCreateByIdentifier(OIDC_ISSUER, NON_ADMIN_SUBJECT)
      return { server, baseUrl, userId: user.id }
    },
    teardown: async ({ server, userId }) => {
      server.kill()
      await pg.queryAsync('DELETE FROM api_key WHERE meta_account_user_id = $1', [userId])
    },
    'stored key has the default 60/1000 limits': async ({ baseUrl }) => {
      const row = await mintAndFetchLimits(baseUrl, NON_ADMIN_SUBJECT)
      expect(row.rate_limit_per_minute).to.equal(60)
      expect(row.rate_limit_per_day).to.equal(1000)
    },
  },
})

'use strict'
const crypto = require('crypto')
const sql = require('sql-template-strings')
const pg = require('fomoplayer_shared').db.pg
const config = require('../config')

const hashApiKey = (rawKey) => crypto.createHmac('sha256', config.cryptoKey).update(rawKey).digest('hex')

module.exports.hashApiKey = hashApiKey

// Effectively-unlimited rate limits assigned to API keys minted for admin
// accounts. Well under the Postgres INTEGER maximum (2,147,483,647), so the
// existing columns and rate limiter are untouched — the sliding-window check
// simply never trips for these keys.
const ADMIN_API_KEY_RATE_LIMITS = { ratePerMinute: 1_000_000_000, ratePerDay: 1_000_000_000 }

module.exports.ADMIN_API_KEY_RATE_LIMITS = ADMIN_API_KEY_RATE_LIMITS

// When `limits` is provided, the per-minute/per-day rate limit columns are set
// explicitly; otherwise they are omitted so the table defaults (60/1000) apply.
module.exports.createApiKey = async (userId, rawKey, name, limits) => {
  const hash = hashApiKey(rawKey)
  const prefix = rawKey.slice(0, 8)
  const rows = await pg.queryRowsAsync(
    limits
      ? sql`
        INSERT INTO api_key (api_key_hash, api_key_prefix, api_key_name, meta_account_user_id, rate_limit_per_minute, rate_limit_per_day)
        VALUES (${hash}, ${prefix}, ${name}, ${userId}, ${limits.ratePerMinute}, ${limits.ratePerDay})
        RETURNING api_key_id, api_key_prefix, api_key_name, api_key_created_at
      `
      : sql`
        INSERT INTO api_key (api_key_hash, api_key_prefix, api_key_name, meta_account_user_id)
        VALUES (${hash}, ${prefix}, ${name}, ${userId})
        RETURNING api_key_id, api_key_prefix, api_key_name, api_key_created_at
      `,
  )
  return rows[0]
}

module.exports.findApiKeyByRaw = async (rawKey) => {
  const hash = hashApiKey(rawKey)
  const rows = await pg.queryRowsAsync(sql`
    SELECT api_key_id, meta_account_user_id, rate_limit_per_minute, rate_limit_per_day, api_key_revoked_at
    FROM api_key WHERE api_key_hash = ${hash}
  `)
  return rows[0] ?? null
}

module.exports.touchApiKey = (apiKeyId) =>
  pg.queryAsync(sql`UPDATE api_key SET api_key_last_used_at = NOW() WHERE api_key_id = ${apiKeyId}`)

module.exports.listApiKeys = (userId) =>
  pg.queryRowsAsync(sql`
    SELECT api_key_id, api_key_prefix, api_key_name, api_key_created_at, api_key_last_used_at
    FROM api_key
    WHERE meta_account_user_id = ${userId} AND api_key_revoked_at IS NULL
    ORDER BY api_key_created_at DESC
  `)

module.exports.revokeApiKey = (apiKeyId, userId) =>
  pg.queryAsync(sql`
    UPDATE api_key SET api_key_revoked_at = NOW()
    WHERE api_key_id = ${apiKeyId} AND meta_account_user_id = ${userId}
  `)

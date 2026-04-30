'use strict'
const crypto = require('crypto')
const sql = require('sql-template-strings')
const pg = require('fomoplayer_shared').db.pg
const config = require('../config')

const hashRefreshToken = (rawToken) =>
  crypto.createHmac('sha256', config.cryptoKey).update(rawToken).digest('hex')

const insertRow = ({ tokenHash, userId, extensionId, chainId, ttlSeconds }) =>
  pg.queryRowsAsync(sql`
    INSERT INTO extension_refresh_token (
      extension_refresh_token_hash,
      meta_account_user_id,
      extension_refresh_token_extension_id,
      extension_refresh_token_chain_id,
      extension_refresh_token_expires_at
    ) VALUES (
      ${tokenHash},
      ${userId},
      ${extensionId},
      ${chainId},
      NOW() + (${ttlSeconds}::int * INTERVAL '1 second')
    )
    RETURNING extension_refresh_token_id, extension_refresh_token_chain_id
  `)

module.exports.createRefreshToken = async ({ userId, extensionId, rawToken, ttlSeconds }) => {
  const chainId = crypto.randomUUID()
  const rows = await insertRow({
    tokenHash: hashRefreshToken(rawToken),
    userId,
    extensionId,
    chainId,
    ttlSeconds,
  })
  return { id: rows[0].extension_refresh_token_id, chainId }
}

module.exports.findRefreshToken = async (rawToken) => {
  const rows = await pg.queryRowsAsync(sql`
    SELECT
      extension_refresh_token_id          AS id,
      meta_account_user_id                AS user_id,
      extension_refresh_token_extension_id AS extension_id,
      extension_refresh_token_chain_id    AS chain_id,
      extension_refresh_token_replaced_by AS replaced_by,
      extension_refresh_token_expires_at  AS expires_at,
      extension_refresh_token_revoked_at  AS revoked_at
    FROM extension_refresh_token
    WHERE extension_refresh_token_hash = ${hashRefreshToken(rawToken)}
  `)
  return rows[0] ?? null
}

module.exports.rotateRefreshToken = async ({ oldRowId, userId, extensionId, chainId, newRawToken, ttlSeconds }) => {
  const inserted = await insertRow({
    tokenHash: hashRefreshToken(newRawToken),
    userId,
    extensionId,
    chainId,
    ttlSeconds,
  })
  const newId = inserted[0].extension_refresh_token_id
  await pg.queryAsync(sql`
    UPDATE extension_refresh_token
    SET extension_refresh_token_replaced_by = ${newId},
        extension_refresh_token_last_used_at = NOW()
    WHERE extension_refresh_token_id = ${oldRowId}
  `)
  return { id: newId }
}

module.exports.revokeRefreshTokenByRaw = async (rawToken) =>
  pg.queryAsync(sql`
    UPDATE extension_refresh_token
    SET extension_refresh_token_revoked_at = NOW()
    WHERE extension_refresh_token_hash = ${hashRefreshToken(rawToken)}
      AND extension_refresh_token_revoked_at IS NULL
  `)

module.exports.revokeChain = async (chainId) =>
  pg.queryAsync(sql`
    UPDATE extension_refresh_token
    SET extension_refresh_token_revoked_at = NOW()
    WHERE extension_refresh_token_chain_id = ${chainId}
      AND extension_refresh_token_revoked_at IS NULL
  `)

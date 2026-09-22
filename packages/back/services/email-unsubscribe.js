// Global (account-wide) email opt-out: a stateless HMAC unsubscribe token and
// the suppression-list DB helpers.
//
// Token shape: base64url(address).base64url(HMAC_SHA256(address, secret)).
// Validation recomputes the HMAC over the decoded address and constant-time
// compares — no token is ever pre-provisioned or stored to be validated; a
// suppression row is written only on an actual opt-out.

const crypto = require('crypto')
const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')
const config = require('../config')

const b64urlEncode = (buf) => Buffer.from(buf).toString('base64url')
const b64urlDecode = (str) => Buffer.from(str, 'base64url')

const hmac = (address, secret) => crypto.createHmac('sha256', secret).update(address, 'utf8').digest()

// --- Token ----------------------------------------------------------------

const generateToken = (address, secret = config.emailUnsubscribeSecret) => {
  if (!secret) {
    throw new Error('EMAIL_UNSUBSCRIBE_SECRET is not configured')
  }
  return `${b64urlEncode(Buffer.from(address, 'utf8'))}.${b64urlEncode(hmac(address, secret))}`
}

// Returns the decoded address for a valid token, or null for any malformed or
// tampered token. Never throws on bad input.
const validateToken = (token, secret = config.emailUnsubscribeSecret) => {
  if (!secret || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [addressPart, sigPart] = parts
  let address
  let providedSig
  try {
    address = b64urlDecode(addressPart).toString('utf8')
    providedSig = b64urlDecode(sigPart)
  } catch {
    return null
  }
  if (!address) return null
  const expectedSig = hmac(address, secret)
  if (providedSig.length !== expectedSig.length) return null
  if (!crypto.timingSafeEqual(providedSig, expectedSig)) return null
  return address
}

// --- URLs / headers -------------------------------------------------------

// Human confirmation page (GET) and machine one-click target (POST) share the
// same URL; verb decides behaviour. Built from apiURL — never a hardcoded host.
const unsubscribeUrl = (address) =>
  `${config.apiURL}/email/unsubscribe?token=${encodeURIComponent(generateToken(address))}`

// RFC 8058 List-Unsubscribe header value. Always includes the HTTPS one-click
// URL; adds a mailto: variant only when EMAIL_UNSUBSCRIBE_MAILTO is configured.
const listUnsubscribeHeaders = (address) => {
  const url = unsubscribeUrl(address)
  const parts = [`<${url}>`]
  if (config.emailUnsubscribeMailto) {
    parts.unshift(`<mailto:${config.emailUnsubscribeMailto}?subject=unsubscribe>`)
  }
  return {
    'List-Unsubscribe': parts.join(', '),
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
}

// --- Suppression DB helpers -----------------------------------------------

const suppress = async (address, source) =>
  pg.queryAsync(
    // language=PostgreSQL
    sql`INSERT INTO email_unsubscribe (email_unsubscribe_address, email_unsubscribe_source)
VALUES (${address}, ${source})
ON CONFLICT (email_unsubscribe_address) DO NOTHING`,
  )

const unsuppress = async (address) =>
  pg.queryAsync(
    // language=PostgreSQL
    sql`DELETE FROM email_unsubscribe WHERE email_unsubscribe_address = ${address}`,
  )

const isSuppressed = async (address) => {
  const rows = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`SELECT 1 FROM email_unsubscribe WHERE email_unsubscribe_address = ${address} LIMIT 1`,
  )
  return rows.length > 0
}

module.exports = {
  generateToken,
  validateToken,
  unsubscribeUrl,
  listUnsubscribeHeaders,
  suppress,
  unsuppress,
  isSuppressed,
}

const { randomBytes, createHash, timingSafeEqual } = require('crypto')

const CODE_TTL_MS = 5 * 60 * 1000

const store = new Map()

const purgeExpired = (now = Date.now()) => {
  for (const [code, entry] of store) {
    if (entry.expiresAt <= now) store.delete(code)
  }
}

const issueCode = (userId, codeChallenge, { boundRedirectUri } = {}) => {
  if (!userId || typeof codeChallenge !== 'string' || codeChallenge.length === 0) {
    throw new Error('issueCode requires userId and codeChallenge')
  }
  purgeExpired()
  const code = randomBytes(32).toString('base64url')
  store.set(code, {
    userId,
    codeChallenge,
    boundRedirectUri: boundRedirectUri || null,
    expiresAt: Date.now() + CODE_TTL_MS,
  })
  return code
}

const consumeCode = (code, codeVerifier, { redirectUri } = {}) => {
  if (typeof code !== 'string' || typeof codeVerifier !== 'string') return null
  const entry = store.get(code)
  if (!entry) return null
  store.delete(code)
  if (entry.expiresAt <= Date.now()) return null

  const expected = Buffer.from(entry.codeChallenge)
  const actual = Buffer.from(createHash('sha256').update(codeVerifier).digest('base64url'))
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null

  if (entry.boundRedirectUri && entry.boundRedirectUri !== redirectUri) return null

  return { userId: entry.userId }
}

module.exports = { issueCode, consumeCode }

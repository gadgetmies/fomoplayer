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

// How long an authorization request stays marked as used. The request is
// identified by its PKCE code challenge, which is part of the authorization
// link, so while the mark lasts, reopening an approved or denied link shows an
// "already used" page instead of the consent screen.
const USED_CHALLENGE_TTL_MS = 24 * 60 * 60 * 1000

const createUsedChallengeStore = ({ ttlMs = USED_CHALLENGE_TTL_MS, now = () => Date.now() } = {}) => {
  const expiries = new Map()

  const purge = (at) => {
    for (const [challenge, expiresAt] of expiries) {
      if (expiresAt <= at) expiries.delete(challenge)
    }
  }

  const isUsed = (codeChallenge) => {
    if (typeof codeChallenge !== 'string' || codeChallenge.length === 0) return false
    const expiresAt = expiries.get(codeChallenge)
    if (expiresAt === undefined) return false
    if (expiresAt <= now()) {
      expiries.delete(codeChallenge)
      return false
    }
    return true
  }

  // Returns false when the challenge was already used, so a caller can refuse
  // to answer the same authorization request twice.
  const markUsed = (codeChallenge) => {
    if (typeof codeChallenge !== 'string' || codeChallenge.length === 0) return false
    const at = now()
    purge(at)
    if (expiries.has(codeChallenge)) return false
    expiries.set(codeChallenge, at + ttlMs)
    return true
  }

  return { isUsed, markUsed }
}

const usedChallenges = createUsedChallengeStore()

module.exports = { issueCode, consumeCode, createUsedChallengeStore, usedChallenges }

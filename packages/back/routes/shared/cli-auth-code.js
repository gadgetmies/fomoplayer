'use strict'

const { randomUUID, createHash } = require('crypto')

const CODE_TTL_MS = 60_000
const codes = new Map()

const issueCode = (userId, codeChallenge) => {
  const code = randomUUID()
  codes.set(code, { userId, codeChallenge, expiresAt: Date.now() + CODE_TTL_MS })
  return code
}

const consumeCode = (code, codeVerifier) => {
  const record = codes.get(code)
  if (!record) return null
  codes.delete(code)
  if (Date.now() > record.expiresAt) return null
  const computed = createHash('sha256').update(codeVerifier).digest('base64url')
  if (computed !== record.codeChallenge) return null
  return { userId: record.userId }
}

module.exports = { issueCode, consumeCode }

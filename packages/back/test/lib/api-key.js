'use strict'
const { randomUUID } = require('crypto')
const { createApiKey } = require('../../db/api-key')
const { resolveTestUserId } = require('./test-user')

module.exports.createTestApiKey = async () => {
  const userId = await resolveTestUserId()
  const raw = `fp_${randomUUID()}`
  await createApiKey(userId, raw, 'Test key')
  return { raw, userId }
}

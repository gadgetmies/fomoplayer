'use strict'
const { createApiKey } = require('../../db/api-key')
const { resolveTestUserId } = require('./test-user')

module.exports.createTestApiKey = async () => {
  const userId = await resolveTestUserId()
  const raw = `fp_test_${Date.now()}`
  await createApiKey(userId, raw, 'Test key')
  return { raw, userId }
}

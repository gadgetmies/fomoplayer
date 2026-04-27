'use strict'
const router = require('express-promise-router')()
const { listApiKeys, revokeApiKey } = require('../../db/api-key')

router.get('/', async ({ user: { id: userId } }, res) => {
  res.json(await listApiKeys(userId))
})

router.delete('/:id', async ({ user: { id: userId }, params: { id } }, res) => {
  await revokeApiKey(parseInt(id, 10), userId)
  res.status(204).end()
})

module.exports = router

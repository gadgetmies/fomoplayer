const assert = require('assert')
const express = require('express')
const request = require('supertest')
const { test } = require('cascade-test')
const { createPublicRouter } = require('../../../../routes/public')

const createApp = ({ config, queryAccountCount }) => {
  const app = express()
  app.use('/api', createPublicRouter({ config, queryAccountCount }))
  return app
}

test({
  'sign-up-available does not query DB in preview mode': async () => {
    let accountCountCalled = false
    const app = createApp({
      config: {
        frontendURL: 'https://fomoplayer.com',
        maxAccountCount: 10,
        isPreviewEnv: true,
      },
      queryAccountCount: async () => {
        accountCountCalled = true
        return 0
      },
    })

    const response = await request(app).get('/api/sign-up-available')
    assert.strictEqual(response.status, 200)
    assert.deepStrictEqual(response.body, { available: false })
    assert.strictEqual(accountCountCalled, false)
  },
})


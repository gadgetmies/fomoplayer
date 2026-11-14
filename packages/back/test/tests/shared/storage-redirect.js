const assert = require('assert')
const express = require('express')
const request = require('supertest')
const { test } = require('cascade-test')
const { createStorageRouter, REDIRECT_MAX_AGE_SECONDS } = require('../../../routes/storage')

const createApp = ({ client = {}, bucket = 'storage-bucket', presign } = {}) => {
  const presigned = []
  const app = express()
  app.use(
    '/api/storage',
    createStorageRouter({
      getClient: () => client,
      getBucketName: () => bucket,
      presign:
        presign ||
        (async (_client, bucketName, key) => {
          presigned.push([bucketName, key])
          return `https://signed.example/${bucketName}/${key}?X-Amz-Signature=abc`
        }),
    }),
  )
  return { app, presigned }
}

test({
  'an object is served as a redirect to its presigned URL': async () => {
    const { app, presigned } = createApp()
    const response = await request(app).get('/api/storage/notification-samples/2/abc.mp3')
    assert.strictEqual(response.status, 302)
    assert.strictEqual(
      response.headers.location,
      'https://signed.example/storage-bucket/notification-samples/2/abc.mp3?X-Amz-Signature=abc',
    )
    assert.strictEqual(response.headers['cache-control'], `private, max-age=${REDIRECT_MAX_AGE_SECONDS}`)
    assert.deepStrictEqual(presigned, [['storage-bucket', 'notification-samples/2/abc.mp3']])
  },

  'an encoded key is signed in its decoded form': async () => {
    const { app, presigned } = createApp()
    const response = await request(app).get('/api/storage/notification-samples/2/a%20b.wav')
    assert.strictEqual(response.status, 302)
    assert.deepStrictEqual(presigned, [['storage-bucket', 'notification-samples/2/a b.wav']])
  },

  'a parent-directory segment is not signed': async () => {
    const { app, presigned } = createApp()
    const response = await request(app).get('/api/storage/notification-samples/%2E%2E/secret')
    assert.strictEqual(response.status, 404)
    assert.deepStrictEqual(presigned, [])
  },

  'without configured storage the route answers 503': async () => {
    const { app, presigned } = createApp({ client: null })
    const response = await request(app).get('/api/storage/x.png')
    assert.strictEqual(response.status, 503)
    assert.deepStrictEqual(presigned, [])
  },

  'a signing failure answers 500': async () => {
    const { app } = createApp({
      presign: async () => {
        throw new Error('boom')
      },
    })
    const response = await request(app).get('/api/storage/x.png')
    assert.strictEqual(response.status, 500)
  },
})

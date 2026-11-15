const assert = require('assert')
const express = require('express')
const request = require('supertest')
const { test } = require('cascade-test')
const { Readable } = require('stream')
const { createStorageRouter, REDIRECT_MAX_AGE_SECONDS, IMAGE_MAX_AGE_SECONDS } = require('../../../routes/storage')

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

const createApp = ({ client = {}, bucket = 'storage-bucket', presign, read } = {}) => {
  const presigned = []
  const reads = []
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
      read:
        read ||
        (async (_client, bucketName, key) => {
          reads.push([bucketName, key])
          return Readable.from([PNG])
        }),
    }),
  )
  return { app, presigned, reads }
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
    const response = await request(app).get('/api/storage/x.mp3')
    assert.strictEqual(response.status, 500)
  },

  // The player masks with waveform images, which a browser only loads cross-origin with CORS headers the bucket lacks
  'a waveform image is served from the page origin, not redirected to the bucket': async () => {
    const { app, presigned, reads } = createApp()
    const response = await request(app).get('/api/storage/notification-samples/2/abc.waveform.png')
    assert.strictEqual(response.status, 200)
    assert.strictEqual(response.headers['content-type'], 'image/png')
    assert.strictEqual(response.headers['cache-control'], `private, max-age=${IMAGE_MAX_AGE_SECONDS}, immutable`)
    assert.deepStrictEqual(response.body, PNG)
    assert.deepStrictEqual(reads, [['storage-bucket', 'notification-samples/2/abc.waveform.png']])
    assert.deepStrictEqual(presigned, [])
  },

  'a missing waveform image answers 404': async () => {
    const { app } = createApp({
      read: async () => {
        throw Object.assign(new Error('The specified key does not exist.'), { code: 'NoSuchKey' })
      },
    })
    const response = await request(app).get('/api/storage/gone.png')
    assert.strictEqual(response.status, 404)
  },

  'a failure reading a waveform image answers 500': async () => {
    const { app } = createApp({
      read: async () => {
        throw new Error('boom')
      },
    })
    const response = await request(app).get('/api/storage/x.png')
    assert.strictEqual(response.status, 500)
  },
})

const assert = require('assert')
const { test } = require('cascade-test')
const {
  ensureBucket,
  parseClientConfig,
  storageObjectPath,
  presignedObjectUrl,
  PRESIGNED_URL_EXPIRY_SECONDS,
} = require('../../../routes/shared/minio')

// A fake storage client that records the calls the helpers make
const fakeClient = (exists) => {
  const calls = []
  return {
    calls,
    bucketExists: async (bucket) => (calls.push(['bucketExists', bucket]), exists),
    makeBucket: async (bucket) => calls.push(['makeBucket', bucket]),
    setBucketPolicy: async (bucket) => calls.push(['setBucketPolicy', bucket]),
    presignedGetObject: async (bucket, key, expiry) => (
      calls.push(['presignedGetObject', bucket, key, expiry]), `https://signed.example/${bucket}/${key}`
    ),
  }
}

test({
  'an existing bucket is left alone': async () => {
    const client = fakeClient(true)
    await ensureBucket(client, 'sample-storage')
    assert.deepStrictEqual(client.calls, [['bucketExists', 'sample-storage']])
  },

  'a missing bucket is created private, as objects are read through presigned URLs': async () => {
    const client = fakeClient(false)
    await ensureBucket(client, 'sample-storage')
    assert.deepStrictEqual(client.calls, [
      ['bucketExists', 'sample-storage'],
      ['makeBucket', 'sample-storage'],
    ])
  },

  'an object is stored as an API path with each key segment encoded': () => {
    assert.strictEqual(
      storageObjectPath('notification-samples/2/a b#.wav'),
      '/api/storage/notification-samples/2/a%20b%23.wav',
    )
  },

  'an object URL is presigned for an hour': async () => {
    const client = fakeClient(true)
    const url = await presignedObjectUrl(client, 'bucket', 'x/y.png')
    assert.strictEqual(url, 'https://signed.example/bucket/x/y.png')
    assert.deepStrictEqual(client.calls, [['presignedGetObject', 'bucket', 'x/y.png', 3600]])
    assert.strictEqual(PRESIGNED_URL_EXPIRY_SECONDS, 3600)
  },

  'client config': {
    'a Railway bucket endpoint uses TLS, the given region and virtual-hosted URLs': () => {
      assert.deepStrictEqual(parseClientConfig('https://t3.storageapi.dev', { region: 'auto', urlStyle: 'virtual' }), {
        endPoint: 't3.storageapi.dev',
        useSSL: true,
        region: 'auto',
        pathStyle: false,
      })
    },

    'a local MinIO over http keeps its port and path-style URLs': () => {
      assert.deepStrictEqual(parseClientConfig('http://localhost:9000/'), {
        endPoint: 'localhost',
        useSSL: false,
        port: 9000,
        pathStyle: true,
      })
    },

    'a bare host defaults to TLS': () => {
      assert.strictEqual(parseClientConfig('minio.example.com').useSSL, true)
    },
  },
})

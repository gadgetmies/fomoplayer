const assert = require('assert')
const { test } = require('cascade-test')
const { ensureBucket } = require('../../../routes/shared/minio')

// A fake MinIO client that records the calls ensureBucket makes
const fakeClient = (exists) => {
  const calls = []
  return {
    calls,
    bucketExists: async (bucket) => (calls.push(['bucketExists', bucket]), exists),
    makeBucket: async (bucket) => calls.push(['makeBucket', bucket]),
    setBucketPolicy: async (bucket, policy) => calls.push(['setBucketPolicy', bucket, JSON.parse(policy)]),
  }
}

test({
  'an existing bucket is left alone': async () => {
    const client = fakeClient(true)
    await ensureBucket(client, 'sample-storage')
    assert.deepStrictEqual(client.calls, [['bucketExists', 'sample-storage']])
  },

  'a missing bucket is created with public reads, as sample URLs are played directly': async () => {
    const client = fakeClient(false)
    await ensureBucket(client, 'sample-storage')
    assert.deepStrictEqual(
      client.calls.map(([call, bucket]) => [call, bucket]),
      [
        ['bucketExists', 'sample-storage'],
        ['makeBucket', 'sample-storage'],
        ['setBucketPolicy', 'sample-storage'],
      ],
    )
    const [statement] = client.calls[2][2].Statement
    assert.deepStrictEqual(statement.Action, ['s3:GetObject'])
    assert.deepStrictEqual(statement.Resource, ['arn:aws:s3:::sample-storage/*'])
  },
})

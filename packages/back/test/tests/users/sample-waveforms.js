const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { test } = require('cascade-test')
const sql = require('sql-template-strings')

const { pg } = require('../../lib/db')
const { resolveTestUserId } = require('../../lib/test-user')
const {
  queryNotificationAudioSamples,
  queryNotificationAudioSamplesWithoutWaveform,
} = require('../../../routes/users/db')
const { storeSampleWaveform, waveformObjectKeyFor } = require('../../../routes/users/sample-waveforms')

const MP3_FIXTURE = path.resolve(__dirname, '../../fixtures/sample-waveform-quiet-then-loud.mp3')

// A fake storage client that keeps what is put into it
const fakeClient = () => {
  const objects = {}
  return {
    objects,
    putObject: async (bucket, key, body, size, metadata) => {
      objects[`${bucket}/${key}`] = { body, size, metadata }
    },
  }
}

const insertSample = async (userId, objectKey) => {
  const [{ id }] = await pg.queryRowsAsync(
    sql`INSERT INTO user_notification_audio_sample
          (meta_account_user_id, user_notification_audio_sample_bucket_name,
           user_notification_audio_sample_object_key, user_notification_audio_sample_url,
           user_notification_audio_sample_file_size, user_notification_audio_sample_file_type,
           user_notification_audio_sample_filename)
        VALUES (${userId}, 'test-bucket', ${objectKey}, ${'/api/storage/' + objectKey}, 1024, 'audio/mpeg',
                ${path.basename(objectKey)})
        RETURNING user_notification_audio_sample_id AS id`,
  )
  return id
}

test({
  setup: async () => {
    const userId = await resolveTestUserId()
    const objectKey = `notification-samples/${userId}/sample-waveforms-test.mp3`
    return { userId, objectKey, sampleId: await insertSample(userId, objectKey) }
  },

  teardown: async ({ sampleId }) => {
    await pg.queryAsync(
      sql`DELETE FROM user_notification_audio_sample WHERE user_notification_audio_sample_id = ${sampleId}`,
    )
  },

  'the waveform image is stored next to the sample': async () => {
    assert.strictEqual(
      waveformObjectKeyFor('notification-samples/12/0b4e-uuid.mp3'),
      'notification-samples/12/0b4e-uuid.waveform.png',
    )
  },

  'a sample without a waveform is listed without one and is picked up by the backfill': async ({
    userId,
    sampleId,
  }) => {
    const sample = (await queryNotificationAudioSamples(userId)).find(({ id }) => id === sampleId)
    assert.strictEqual(sample.waveformUrl, null)
    assert.strictEqual(sample.durationMs, null)
    const pending = await queryNotificationAudioSamplesWithoutWaveform(sampleId - 1, 1)
    assert.deepStrictEqual(
      pending.map(({ id }) => id),
      [sampleId],
    )
    assert.deepStrictEqual(
      await queryNotificationAudioSamplesWithoutWaveform(sampleId, 1000).then((rows) =>
        rows.filter(({ id }) => id === sampleId),
      ),
      [],
    )
  },

  'storing the waveform puts the image in the bucket and lists it with the duration': async ({
    userId,
    sampleId,
    objectKey,
  }) => {
    const client = fakeClient()
    const stored = await storeSampleWaveform({
      client,
      bucketName: 'test-bucket',
      sampleId,
      sampleObjectKey: objectKey,
      audio: fs.readFileSync(MP3_FIXTURE),
    })

    const waveformObjectKey = `notification-samples/${userId}/sample-waveforms-test.waveform.png`
    const object = client.objects[`test-bucket/${waveformObjectKey}`]
    assert.ok(object, 'the image is put in the bucket')
    assert.deepStrictEqual(object.metadata, { 'Content-Type': 'image/png' })
    assert.strictEqual(object.body.subarray(1, 4).toString('ascii'), 'PNG')

    const sample = (await queryNotificationAudioSamples(userId)).find(({ id }) => id === sampleId)
    assert.strictEqual(sample.waveformUrl, `/api/storage/${waveformObjectKey}`)
    assert.strictEqual(sample.waveformObjectKey, waveformObjectKey)
    assert.ok(Math.abs(sample.durationMs - 4000) < 150, `duration ${sample.durationMs}`)
    assert.deepStrictEqual(stored, {
      waveformObjectKey,
      waveformUrl: sample.waveformUrl,
      durationMs: sample.durationMs,
    })
    const pending = await queryNotificationAudioSamplesWithoutWaveform(sampleId - 1, 1000)
    assert.ok(!pending.some(({ id }) => id === sampleId), 'the backfill skips it')
  },

  'a sample that cannot be decoded is left without a waveform': async ({ userId, sampleId, objectKey }) => {
    await pg.queryAsync(
      sql`UPDATE user_notification_audio_sample
          SET user_notification_audio_sample_waveform_url = NULL,
              user_notification_audio_sample_waveform_object_key = NULL,
              user_notification_audio_sample_duration_ms = NULL
          WHERE user_notification_audio_sample_id = ${sampleId}`,
    )
    const client = fakeClient()
    await assert.rejects(
      storeSampleWaveform({
        client,
        bucketName: 'test-bucket',
        sampleId,
        sampleObjectKey: objectKey,
        audio: Buffer.from('not audio'),
      }),
    )
    assert.deepStrictEqual(client.objects, {})
    const sample = (await queryNotificationAudioSamples(userId)).find(({ id }) => id === sampleId)
    assert.strictEqual(sample.waveformUrl, null)
  },
})

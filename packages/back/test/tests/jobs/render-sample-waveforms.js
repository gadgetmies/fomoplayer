const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { Readable } = require('stream')
const { test } = require('cascade-test')
const sql = require('sql-template-strings')

const { pg } = require('../../lib/db')
const { resolveTestUserId } = require('../../lib/test-user')
const { queryNotificationAudioSamples } = require('../../../routes/users/db')
const { renderSampleWaveforms } = require('../../../jobs/render-sample-waveforms')

const MP3 = fs.readFileSync(path.resolve(__dirname, '../../fixtures/sample-waveform-quiet-then-loud.mp3'))

// A fake storage client holding the given objects, keeping what is put into it
const fakeClient = (objects) => {
  const put = {}
  return {
    put,
    getObject: async (bucket, key) => {
      const body = objects[`${bucket}/${key}`]
      if (!body) throw Object.assign(new Error('The specified key does not exist.'), { code: 'NoSuchKey' })
      return Readable.from([body])
    },
    putObject: async (bucket, key, body) => {
      put[`${bucket}/${key}`] = body
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
        VALUES (${userId}, 'old-bucket', ${objectKey}, ${'/api/storage/' + objectKey}, 1024, 'audio/mpeg',
                ${path.basename(objectKey)})
        RETURNING user_notification_audio_sample_id AS id`,
  )
  return id
}

const listed = async (userId, id) => (await queryNotificationAudioSamples(userId)).find((sample) => sample.id === id)

test({
  setup: async () => {
    const userId = await resolveTestUserId()
    const goodKey = `notification-samples/${userId}/render-job-good.mp3`
    const brokenKey = `notification-samples/${userId}/render-job-broken.mp3`
    return {
      userId,
      goodKey,
      good: await insertSample(userId, goodKey),
      broken: await insertSample(userId, brokenKey),
      objects: { [`old-bucket/${goodKey}`]: MP3, [`old-bucket/${brokenKey}`]: Buffer.from('not audio') },
    }
  },

  teardown: async ({ good, broken }) => {
    await pg.queryAsync(
      sql`DELETE FROM user_notification_audio_sample WHERE user_notification_audio_sample_id IN (${good}, ${broken})`,
    )
  },

  'the job is registered and can be run from Admin › Jobs': async () => {
    const [job] = await pg.queryRowsAsync(
      sql`SELECT job_enabled AS enabled, job_schedule AS schedule
          FROM job NATURAL LEFT JOIN job_schedule WHERE job_name = 'renderSampleWaveforms'`,
    )
    assert.deepStrictEqual(job, { enabled: true, schedule: null })
  },

  'without storage the run fails and says why': async () => {
    const run = await renderSampleWaveforms({ id: 1 }, { client: null, bucketName: null })
    assert.deepStrictEqual(run, { success: false, result: { error: 'Object storage is not configured' } })
  },

  'a run stores the waveforms it can render and reports the samples it cannot': async ({
    userId,
    good,
    broken,
    goodKey,
    objects,
  }) => {
    const client = fakeClient(objects)
    const { success, result } = await renderSampleWaveforms({ id: 1 }, { client, bucketName: 'storage' })

    // The audio is read from the bucket the sample was uploaded to, the image written to the current one
    const waveformKey = goodKey.replace(/\.mp3$/, '.waveform.png')
    assert.ok(client.put[`storage/${waveformKey}`], 'the waveform image is stored')
    const sample = await listed(userId, good)
    assert.strictEqual(sample.waveformUrl, `/api/storage/${waveformKey}`)
    assert.ok(Math.abs(sample.durationMs - 4000) < 150, `duration ${sample.durationMs}`)

    assert.strictEqual(success, false, 'a sample that cannot be rendered fails the run')
    assert.ok(result.stored >= 1)
    const failure = result.failed.find(({ id }) => id === broken)
    assert.ok(failure, 'the broken sample is reported')
    assert.strictEqual(failure.filename, 'render-job-broken.mp3')
    assert.ok(failure.error, 'with the reason')
    assert.strictEqual((await listed(userId, broken)).waveformUrl, null)
  },

  'a run stops at its limit and says more may remain': async ({ objects }) => {
    const { result } = await renderSampleWaveforms(
      { id: 1 },
      { client: fakeClient(objects), bucketName: 'storage', limit: 1 },
    )
    assert.strictEqual(result.seen, 1)
    assert.strictEqual(result.moreMayRemain, true)
  },
})

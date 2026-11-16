const assert = require('assert')
const { Readable } = require('stream')
const { test } = require('cascade-test')
const sql = require('sql-template-strings')

const { pg } = require('../../lib/db')
const { resolveTestUserId } = require('../../lib/test-user')
const { EMBEDDING_TYPE } = require('../../../routes/shared/db/cart-similarity')
const { querySampleSimilarTracks } = require('../../../routes/shared/db/sample-similarity')
const { embedNotificationAudioSamples, startEmbeddingAfterUpload } = require('../../../jobs/sample-embeddings')

const SERVICE = 'http://embedding.test:8080'
const TOKEN = 'test-token'
const VECTOR = Array.from({ length: 1280 }, (_, i) => Math.sin(i + 1))

// A fake storage client holding the given objects
const fakeClient = (objects) => ({
  getObject: async (bucket, key) => {
    const body = objects[`${bucket}/${key}`]
    if (!body) throw Object.assign(new Error('The specified key does not exist.'), { code: 'NoSuchKey' })
    return Readable.from([body])
  },
})

// A fake embedding service: answers per audio body, records what it was sent
const fakeService = (answers) => {
  const calls = []
  const fetchFn = async (url, { headers, body }) => {
    calls.push({ url, headers, audio: body.toString() })
    const answer = answers[body.toString()] || { status: 200, body: { model: EMBEDDING_TYPE, embedding: VECTOR } }
    return new Response(JSON.stringify(answer.body), { status: answer.status })
  }
  return { calls, fetchFn }
}

const insertSample = async (userId, name, createdAt) => {
  const objectKey = `notification-samples/${userId}/embedding-job-${name}.mp3`
  const [{ id }] = await pg.queryRowsAsync(
    sql`INSERT INTO user_notification_audio_sample
          (meta_account_user_id, user_notification_audio_sample_bucket_name,
           user_notification_audio_sample_object_key, user_notification_audio_sample_url,
           user_notification_audio_sample_file_size, user_notification_audio_sample_file_type,
           user_notification_audio_sample_filename, user_notification_audio_sample_created_at)
        VALUES (${userId}, 'storage', ${objectKey}, ${'/api/storage/' + objectKey}, 1024, 'audio/mpeg',
                ${name + '.mp3'}, ${createdAt})
        RETURNING user_notification_audio_sample_id AS id`,
  )
  return { id, objectKey }
}

const embeddingOf = async (id) =>
  (
    await pg.queryRowsAsync(
      sql`SELECT user_notification_audio_sample_embedding_type AS type
          FROM user_notification_audio_sample_embedding WHERE user_notification_audio_sample_id = ${id}`,
    )
  ).map(({ type }) => type)

const clearEmbeddings = (ids) =>
  pg.queryAsync(
    sql`DELETE FROM user_notification_audio_sample_embedding WHERE user_notification_audio_sample_id = ANY(${ids})`,
  )

const options = (fetchFn, objects, extra = {}) => ({
  serviceUrl: SERVICE,
  token: TOKEN,
  limit: 50,
  client: fakeClient(objects),
  bucketName: 'storage',
  fetchFn,
  // Three short waits that record themselves instead of sleeping, so retries cost no test time
  retryDelaysMs: [10, 20, 40],
  sleep: async () => {},
  ...extra,
})

const refused = () =>
  new TypeError('fetch failed', {
    cause: Object.assign(new Error('connect ECONNREFUSED fd12::1:8080'), { code: 'ECONNREFUSED' }),
  })

const jobRuns = async () =>
  pg.queryRowsAsync(
    sql`SELECT job_run_id AS id, job_run_ended IS NOT NULL AS ended, job_run_success AS success, job_run_result AS result
        FROM job_run NATURAL JOIN job WHERE job_name = 'embedNotificationAudioSamples' ORDER BY job_run_id`,
  )

const waitFor = async (check, timeoutMs = 10000) => {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const value = await check()
    if (value) return value
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('Timed out waiting')
}

const ourCalls = (calls, samples) => calls.filter(({ audio }) => samples.some(({ name }) => name === audio))

test({
  setup: async () => {
    const userId = await resolveTestUserId()
    // Future timestamps put these first in the job's newest-first order, ahead of other tests' samples
    const samples = []
    for (const [index, name] of ['first', 'broken', 'third'].entries()) {
      samples.push({ name, ...(await insertSample(userId, name, new Date(Date.now() + 3600_000 - index * 1000))) })
    }
    const objects = Object.fromEntries(samples.map(({ name, objectKey }) => [`storage/${objectKey}`, Buffer.from(name)]))
    return { userId, samples, ids: samples.map(({ id }) => id), objects }
  },

  teardown: async ({ ids }) => {
    await clearEmbeddings(ids)
    await pg.queryAsync(sql`DELETE FROM user_notification_audio_sample WHERE user_notification_audio_sample_id = ANY(${ids})`)
  },

  'the job is registered and runs every 10 minutes': async () => {
    const [job] = await pg.queryRowsAsync(
      sql`SELECT job_enabled AS enabled, job_schedule AS schedule
          FROM job NATURAL LEFT JOIN job_schedule WHERE job_name = 'embedNotificationAudioSamples'`,
    )
    assert.deepStrictEqual(job, { enabled: true, schedule: '*/10 * * * *' })
  },

  'without the service configured the run is skipped and touches nothing': async ({ ids, objects }) => {
    const { calls, fetchFn } = fakeService({})
    const run = await embedNotificationAudioSamples({ id: 1 }, options(fetchFn, objects, { serviceUrl: undefined }))
    assert.strictEqual(run.success, true)
    assert.match(run.result.skipped, /EMBEDDING_SERVICE_URL/)
    assert.strictEqual(calls.length, 0)
    for (const id of ids) assert.deepStrictEqual(await embeddingOf(id), [])
  },

  'one failing sample does not stop the others, and Sounds like stops being pending': async ({
    userId,
    samples,
    objects,
  }) => {
    const [first, broken, third] = samples
    assert.strictEqual((await querySampleSimilarTracks(userId, first.id, 5)).pending, true)

    const { calls, fetchFn } = fakeService({ broken: { status: 422, body: { error: 'could not decode audio' } } })
    const { success, result } = await embedNotificationAudioSamples({ id: 1 }, options(fetchFn, objects))

    // The service is called with the token and the sample's own audio and type
    const sent = ourCalls(calls, samples)
    assert.deepStrictEqual(sent.map(({ audio }) => audio), ['first', 'broken', 'third'])
    assert.strictEqual(sent[0].url, `${SERVICE}/embed`)
    assert.strictEqual(sent[0].headers.Authorization, `Bearer ${TOKEN}`)
    assert.strictEqual(sent[0].headers['Content-Type'], 'audio/mpeg')

    assert.deepStrictEqual(await embeddingOf(first.id), [EMBEDDING_TYPE])
    assert.deepStrictEqual(await embeddingOf(third.id), [EMBEDDING_TYPE])
    assert.deepStrictEqual(await embeddingOf(broken.id), [])
    assert.strictEqual((await querySampleSimilarTracks(userId, first.id, 5)).pending, false)

    assert.strictEqual(success, true)
    const failure = result.failed.find(({ id }) => id === broken.id)
    assert.deepStrictEqual(failure, {
      id: broken.id,
      filename: 'broken.mp3',
      error: 'Embedding service answered 422: could not decode audio',
    })
  },

  'already embedded samples are not sent again': async ({ samples, objects }) => {
    const { calls, fetchFn } = fakeService({ broken: { status: 422, body: { error: 'still broken' } } })
    await embedNotificationAudioSamples({ id: 1 }, options(fetchFn, objects))
    assert.deepStrictEqual(ourCalls(calls, samples).map(({ audio }) => audio), ['broken'])
  },

  'a run where every sample fails fails, so a broken service shows up in Admin › Jobs': async ({
    ids,
    objects,
  }) => {
    await clearEmbeddings(ids)
    const fetchFn = async () => {
      throw new Error('connect ECONNREFUSED')
    }
    const { success, result } = await embedNotificationAudioSamples({ id: 1 }, options(fetchFn, objects, { limit: 3 }))
    assert.strictEqual(success, false)
    assert.strictEqual(result.embedded, 0)
    assert.deepStrictEqual(
      result.failed.map(({ id, error }) => [id, error]),
      ids.map((id) => [id, 'connect ECONNREFUSED']),
    )
    assert.strictEqual(result.moreMayRemain, true)
  },

  'an upload starts a run without waiting for it, and a failure to start does not escape': async () => {
    let started = 0
    const pending = new Promise(() => {})
    assert.strictEqual(startEmbeddingAfterUpload({ runJob: () => (started++, pending) }), undefined)
    assert.strictEqual(started, 1)
    startEmbeddingAfterUpload({ runJob: async () => Promise.reject(new Error('database is down')) })
    await new Promise((resolve) => setImmediate(resolve))
  },

  'an upload starts a scheduler run, which is skipped where the service is not configured': async () => {
    const before = (await jobRuns()).length
    startEmbeddingAfterUpload()
    const run = await waitFor(async () => (await jobRuns()).slice(before).find(({ ended }) => ended))
    assert.strictEqual(run.success, true)
    assert.match(run.result.skipped, /EMBEDDING_SERVICE_URL/)
  },

  'an upload while a run is in progress starts no second run': async () => {
    const [{ id: inProgress }] = await pg.queryRowsAsync(
      sql`INSERT INTO job_run (job_id) SELECT job_id FROM job WHERE job_name = 'embedNotificationAudioSamples'
          RETURNING job_run_id AS id`,
    )
    try {
      const before = (await jobRuns()).length
      startEmbeddingAfterUpload()
      await new Promise((resolve) => setTimeout(resolve, 500))
      assert.strictEqual((await jobRuns()).length, before)
    } finally {
      await pg.queryAsync(sql`DELETE FROM job_run WHERE job_run_id = ${inProgress}`)
    }
  },

  'a connection failure names its cause': async ({ ids, objects }) => {
    await clearEmbeddings(ids)
    const fetchFn = async () => {
      throw new TypeError('fetch failed', {
        cause: Object.assign(new Error('connect ECONNREFUSED fd12::1:8080'), { code: 'ECONNREFUSED' }),
      })
    }
    const { result } = await embedNotificationAudioSamples({ id: 1 }, options(fetchFn, objects, { limit: 3 }))
    assert.deepStrictEqual(
      result.failed.map(({ error }) => error),
      ids.map(() => 'fetch failed (ECONNREFUSED)'),
    )
  },

  'a sample sent while the service sleeps is retried until it wakes, in the same run': async ({ samples, objects, ids }) => {
    await clearEmbeddings(ids)
    const [first] = samples
    const service = fakeService({})
    let refusals = 2
    const fetchFn = async (url, request) => {
      if (refusals > 0) {
        refusals--
        throw refused()
      }
      return service.fetchFn(url, request)
    }
    const waits = []
    const { success, result } = await embedNotificationAudioSamples(
      { id: 1 },
      options(fetchFn, objects, { limit: 3, sleep: async (ms) => waits.push(ms) }),
    )
    assert.deepStrictEqual(waits, [10, 20], 'waits grow until the service answers')
    assert.strictEqual(success, true)
    assert.deepStrictEqual(result.failed, [])
    assert.deepStrictEqual(await embeddingOf(first.id), [EMBEDDING_TYPE])
    assert.deepStrictEqual(ourCalls(service.calls, samples).map(({ audio }) => audio), ['first', 'broken', 'third'])
  },

  'an HTTP answer is not retried': async ({ samples, objects, ids }) => {
    await clearEmbeddings(ids)
    const { calls, fetchFn } = fakeService({ broken: { status: 422, body: { error: 'could not decode audio' } } })
    const waits = []
    await embedNotificationAudioSamples(
      { id: 1 },
      options(fetchFn, objects, { limit: 3, sleep: async (ms) => waits.push(ms) }),
    )
    assert.deepStrictEqual(waits, [])
    assert.strictEqual(ourCalls(calls, samples).filter(({ audio }) => audio === 'broken').length, 1)
  },

  'a service down for the whole run is waited for once, then each sample is tried once': async ({ ids, objects }) => {
    await clearEmbeddings(ids)
    let calls = 0
    const fetchFn = async () => {
      calls++
      throw refused()
    }
    const waits = []
    const { success, result } = await embedNotificationAudioSamples(
      { id: 1 },
      options(fetchFn, objects, { limit: 3, sleep: async (ms) => waits.push(ms) }),
    )
    assert.deepStrictEqual(waits, [10, 20, 40], 'only the first sample waits')
    assert.strictEqual(calls, 4 + 1 + 1)
    assert.strictEqual(success, false)
    assert.deepStrictEqual(
      result.failed.map(({ id, error }) => [id, error]),
      ids.map((id) => [id, 'fetch failed (ECONNREFUSED)']),
    )
  },

  'a vector from another model is refused': async ({ samples, objects }) => {
    const { fetchFn } = fakeService(
      Object.fromEntries(samples.map(({ name }) => [name, { status: 200, body: { model: 'other-model', embedding: VECTOR } }])),
    )
    const { result } = await embedNotificationAudioSamples({ id: 1 }, options(fetchFn, objects, { limit: 3 }))
    assert.match(result.failed[0].error, /used model other-model/)
    for (const { id } of samples) assert.deepStrictEqual(await embeddingOf(id), [])
  },
})

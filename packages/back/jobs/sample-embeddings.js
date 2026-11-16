const sql = require('sql-template-strings')
const pg = require('fomoplayer_shared').db.pg
const logger = require('fomoplayer_shared').logger(__filename)

const config = require('../config')
const { EMBEDDING_TYPE } = require('../routes/shared/db/cart-similarity')
const { upsertNotificationAudioSampleEmbedding } = require('../routes/admin/db')
const { getMinioClient, getBucketName } = require('../routes/shared/minio')
const { readObject } = require('../routes/users/sample-waveforms')

// A sample's audio is a few MB at most; the model takes seconds on CPU.
const REQUEST_TIMEOUT_MS = 120 * 1000

// fetch reports a connection failure as 'fetch failed' and keeps the reason (ECONNREFUSED, ENOTFOUND…) in cause
const describeError = (error) => {
  const cause = error.cause && (error.cause.code || error.cause.message)
  return cause ? `${error.message} (${cause})` : error.message
}

// The embedding service sleeps when idle (Railway app sleeping): the first connection only wakes it and is refused
// while it starts (about 4 s, including loading the model). Retry such connection failures with these waits, about
// 30 s in all; an HTTP answer came from a running service and is final.
const WAKE_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000]
const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'UND_ERR_SOCKET',
])
const isConnectionError = (error) => Boolean(error.cause && CONNECTION_ERROR_CODES.has(error.cause.code))
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const queryPendingSamples = (limit) =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryNotificationAudioSamplesWithoutEmbeddingOfType
SELECT user_notification_audio_sample_id         AS id,
       user_notification_audio_sample_object_key AS "objectKey",
       user_notification_audio_sample_file_type  AS "fileType",
       user_notification_audio_sample_filename   AS filename
FROM user_notification_audio_sample s
WHERE NOT EXISTS (SELECT 1
                  FROM user_notification_audio_sample_embedding e
                  WHERE e.user_notification_audio_sample_id = s.user_notification_audio_sample_id
                    AND e.user_notification_audio_sample_embedding_type = ${EMBEDDING_TYPE})
ORDER BY user_notification_audio_sample_created_at DESC, user_notification_audio_sample_id DESC
LIMIT ${limit}`,
  )

const requestEmbedding = async ({ fetchFn, serviceUrl, token, audio, fileType }) => {
  const res = await fetchFn(`${serviceUrl.replace(/\/$/, '')}/embed`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': fileType || 'application/octet-stream' },
    body: audio,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Embedding service answered ${res.status}${body.error ? `: ${body.error}` : ''}`)
  if (body.model !== EMBEDDING_TYPE) {
    throw new Error(`Embedding service used model ${body.model}, expected ${EMBEDDING_TYPE}`)
  }
  if (!Array.isArray(body.embedding) || body.embedding.length === 0) {
    throw new Error('Embedding service returned no embedding')
  }
  return body.embedding
}

// Retries requestEmbedding while the service cannot be connected to. Once a sample has used up the waits without
// connecting, `reach.reachable` is false and later samples in the run get a single try, so a service that is really
// down does not stretch the run.
const requestEmbeddingWhenAwake = async (request, { retryDelaysMs, sleep, reach }) => {
  const delays = reach.reachable ? retryDelaysMs : []
  for (let attempt = 0; ; attempt++) {
    try {
      const embedding = await request()
      reach.reachable = true
      return embedding
    } catch (error) {
      if (!isConnectionError(error)) throw error
      if (attempt >= delays.length) {
        reach.reachable = false
        throw error
      }
      await sleep(delays[attempt])
    }
  }
}

// Embeds uploaded audio samples that have no embedding of the production type, newest first, so their Sounds like
// lists fill in. Runs on a schedule and right after each upload. Each sample's audio is read from the current bucket
// and sent to the embedding service (analyser/embedding_service.py), which only turns audio into a vector; the
// vector is stored here. A sample that fails is listed in the result and retried by a later run without stopping the
// others. The run fails only when every sample in it failed, which points at the service rather than one file.
const JOB_NAME = 'embedNotificationAudioSamples'

// Starts a run right after a sample upload so its Sounds like list fills in without waiting for the schedule. Returns
// at once: the upload does not depend on the run, and when a run is already in progress no second one starts (the
// scheduler skips it) and the sample is picked up by a later run. job-scheduling is required here, not at the top,
// because it loads this module.
module.exports.startEmbeddingAfterUpload = ({ runJob = require('../job-scheduling').runJob } = {}) => {
  runJob(JOB_NAME).catch((error) => logger.warn('Could not start sample embedding after upload', { error: error.message }))
}

module.exports.embedNotificationAudioSamples = async (
  _jobRun,
  {
    serviceUrl = config.embeddingServiceURL,
    token = config.embeddingServiceToken,
    limit = config.embeddingJobBatchSize,
    client = getMinioClient(),
    bucketName = getBucketName(),
    fetchFn = fetch,
    retryDelaysMs = WAKE_RETRY_DELAYS_MS,
    sleep = wait,
  } = {},
) => {
  if (!serviceUrl || !token) {
    return { success: true, result: { skipped: 'EMBEDDING_SERVICE_URL and EMBEDDING_SERVICE_TOKEN are not configured' } }
  }
  if (!client || !bucketName) return { success: false, result: { error: 'Object storage is not configured' } }

  const pending = await queryPendingSamples(limit)
  const embedded = []
  const failed = []
  const reach = { reachable: true }
  for (const { id, objectKey, fileType, filename } of pending) {
    try {
      const audio = await readObject(client, bucketName, objectKey)
      const embedding = await requestEmbeddingWhenAwake(
        () => requestEmbedding({ fetchFn, serviceUrl, token, audio, fileType }),
        { retryDelaysMs, sleep, reach },
      )
      await upsertNotificationAudioSampleEmbedding(id, EMBEDDING_TYPE, JSON.stringify(embedding))
      embedded.push(id)
    } catch (error) {
      logger.warn('Could not embed an audio sample', { sampleId: id, error: describeError(error) })
      failed.push({ id, filename, error: describeError(error) })
    }
  }

  return {
    success: pending.length === 0 || embedded.length > 0,
    result: { embedded: embedded.length, failed, moreMayRemain: pending.length === limit },
  }
}

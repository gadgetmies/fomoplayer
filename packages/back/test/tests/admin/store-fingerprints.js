'use strict'

// The analyser's fingerprint uploads can take longer than the 25 s request
// timeout: a Bandcamp preview is a full track with 10,000-30,000 fingerprints.
// The upload routes get a longer limit, and their handler must not answer a
// request the timeout already answered (that threw "Cannot set headers after
// they are sent to the client"), while still logging what happened.

const assert = require('assert')
const { test } = require('cascade-test')
const express = require('express')
const supertest = require('supertest')

const { createRequestTimeout } = require('../../../routes/shared/request-timeout')
const { storeFingerprintsHandler } = require('../../../routes/admin/api')

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const recordingLog = () => {
  const calls = []
  const make = (level) => (message, context) => calls.push({ level, message, context })
  return { log: { info: make('info'), warn: make('warn'), error: make('error') }, calls }
}

// An app with the timeout middleware in front of a handler that takes `storeMs` to store.
const appWith = ({ store, afterStore, log, path = '/api/admin/exact-match/previews/fingerprints' }) => {
  const app = express()
  app.use(express.json())
  app.use(createRequestTimeout({ defaultTimeout: '50ms', fingerprintUploadTimeout: '400ms' }))
  app.post(path, storeFingerprintsHandler({ idField: 'preview_id', label: 'preview', store, afterStore, log }))
  app.post('/api/other', async (req, res) => {
    await delay(150)
    if (!req.timedout) res.send({ ok: true })
  })
  return app
}

const upload = (app, path = '/api/admin/exact-match/previews/fingerprints') =>
  supertest(app)
    .post(path)
    .send({ preview_id: 7, fingerprints: [{ hash: 1 }, { hash: 2 }] })

test({
  'other requests keep the short limit': async () => {
    const res = await supertest(appWith({ store: async () => {}, log: recordingLog().log })).post('/api/other')
    assert.strictEqual(res.status, 503)
  },

  'a fingerprint upload slower than the short limit succeeds': async () => {
    const stored = []
    const { log, calls } = recordingLog()
    const app = appWith({
      store: async (id, fingerprints) => {
        await delay(150)
        stored.push({ id, count: fingerprints.length })
      },
      log,
    })
    const res = await upload(app)
    assert.strictEqual(res.status, 200)
    assert.deepStrictEqual(res.body, { success: true, preview_id: 7 })
    assert.deepStrictEqual(stored, [{ id: 7, count: 2 }])
    assert.deepStrictEqual(calls, [])
  },

  'audio sample uploads get the longer limit too': async () => {
    const path = '/api/admin/exact-match/audio-samples/fingerprints'
    const app = express()
    app.use(express.json())
    app.use(createRequestTimeout({ defaultTimeout: '50ms', fingerprintUploadTimeout: '400ms' }))
    app.post(
      path,
      storeFingerprintsHandler({
        idField: 'sample_id',
        label: 'audio sample',
        store: () => delay(150),
        log: recordingLog().log,
      }),
    )
    const res = await supertest(app).post(path).send({ sample_id: 3, fingerprints: [] })
    assert.deepStrictEqual([res.status, res.body], [200, { success: true, sample_id: 3 }])
  },

  'an upload stored after the timeout answered logs a warning and does not answer again': async () => {
    const { log, calls } = recordingLog()
    let finished
    const done = new Promise((resolve) => (finished = resolve))
    const app = appWith({
      store: async () => {
        await delay(600)
      },
      afterStore: async () => finished(),
      log,
    })
    const res = await upload(app)
    assert.strictEqual(res.status, 503, 'the timeout answers first')
    await done
    await delay(20)
    assert.deepStrictEqual(
      calls.map(({ level, message, context }) => ({ level, message, context })),
      [
        {
          level: 'warn',
          message: 'Stored preview fingerprints after the request timed out',
          context: { preview_id: 7, fingerprintCount: 2 },
        },
      ],
    )
  },

  'a failure to store is logged as an error and answered with 500': async () => {
    const { log, calls } = recordingLog()
    const app = appWith({
      store: async () => {
        throw new Error('deadlock detected')
      },
      log,
    })
    const res = await upload(app)
    assert.deepStrictEqual([res.status, res.body], [500, { error: 'deadlock detected' }])
    assert.deepStrictEqual(
      calls.map(({ level, message, context }) => [level, message, context.preview_id, context.timedOut, context.error]),
      [['error', 'Storing preview fingerprints failed', 7, false, 'deadlock detected']],
    )
  },

  'a failure to store after the timeout is still logged as an error': async () => {
    const { log, calls } = recordingLog()
    let failed
    const done = new Promise((resolve) => (failed = resolve))
    const app = appWith({
      store: async () => {
        await delay(600)
        setImmediate(failed)
        throw new Error('connection terminated')
      },
      log,
    })
    const res = await upload(app)
    assert.strictEqual(res.status, 503)
    await done
    await delay(20)
    assert.deepStrictEqual(
      calls.map(({ level, message, context }) => [level, message, context.timedOut, context.error]),
      [['error', 'Storing preview fingerprints failed', true, 'connection terminated']],
    )
  },
})

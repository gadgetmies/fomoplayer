const assert = require('assert')
const { test } = require('cascade-test')
const sql = require('sql-template-strings')
const express = require('express')
const request = require('supertest')
const { initDb, pg } = require('../../lib/db.js')
const { setJobEnabled } = require('../../../routes/admin/db.js')
const { setJobEnabledHandler } = require('../../../routes/admin/api.js')

const silentLog = { info: () => {} }

// Mounts only the toggle route, with the real database write and a counting stand-in for the scheduler reload.
const createApp = () => {
  const reschedules = []
  const app = express()
  app.use(express.json())
  app.put(
    '/jobs/:name/enabled',
    setJobEnabledHandler(setJobEnabled, async () => reschedules.push(true), silentLog),
  )
  return { app, reschedules }
}

const jobEnabled = async (name) => {
  const [{ enabled }] = await pg.queryRowsAsync(sql`SELECT job_enabled AS enabled FROM job WHERE job_name = ${name}`)
  return enabled
}

const JOB = 'adminToggleTestJob'

test({
  setup: async () => {
    await initDb()
    await pg.queryAsync(sql`INSERT INTO job (job_name, job_enabled) VALUES (${JOB}, TRUE)`)
  },

  'disabling a job stores it and reloads the schedule': async () => {
    const { app, reschedules } = createApp()
    const response = await request(app).put(`/jobs/${JOB}/enabled`).send({ enabled: false })
    assert.strictEqual(response.status, 200)
    assert.deepStrictEqual(response.body, { name: JOB, enabled: false })
    assert.strictEqual(await jobEnabled(JOB), false)
    assert.strictEqual(reschedules.length, 1)
  },

  'enabling a disabled job stores it': async () => {
    await pg.queryAsync(sql`UPDATE job SET job_enabled = FALSE WHERE job_name = ${JOB}`)
    const { app } = createApp()
    const response = await request(app).put(`/jobs/${JOB}/enabled`).send({ enabled: true })
    assert.strictEqual(response.status, 200)
    assert.strictEqual(await jobEnabled(JOB), true)
  },

  'an unknown job is a 404 and reloads nothing': async () => {
    const { app, reschedules } = createApp()
    const response = await request(app).put('/jobs/noSuchJob/enabled').send({ enabled: false })
    assert.strictEqual(response.status, 404)
    assert.strictEqual(reschedules.length, 0)
  },

  'a non-boolean enabled is a 400 and changes nothing': async () => {
    await pg.queryAsync(sql`UPDATE job SET job_enabled = TRUE WHERE job_name = ${JOB}`)
    const { app, reschedules } = createApp()
    const response = await request(app).put(`/jobs/${JOB}/enabled`).send({ enabled: 'false' })
    assert.strictEqual(response.status, 400)
    assert.strictEqual(await jobEnabled(JOB), true)
    assert.strictEqual(reschedules.length, 0)
  },

  teardown: async () => {
    await pg.queryAsync(sql`DELETE FROM job WHERE job_name = ${JOB}`)
  },
})

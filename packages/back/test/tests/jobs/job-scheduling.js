const assert = require('assert')
const { test } = require('cascade-test')
const sql = require('sql-template-strings')
const { initDb, pg } = require('../../lib/db.js')
const { updateJobs, getScheduled, cancelAll } = require('../../../job-scheduling.js')

// updateJobs runs every few minutes in production and re-reads the job table so
// that flipping job_enabled or editing job_schedule takes effect without a
// redeploy. These tests exercise that live reload path against a job the
// scheduler already holds in memory.
const JOB = 'updateTrackDetails'

const setEnabled = (enabled) => pg.queryAsync(sql`UPDATE job SET job_enabled = ${enabled} WHERE job_name = ${JOB}`)

const setSchedule = (schedule) =>
  pg.queryAsync(sql`UPDATE job_schedule SET job_schedule = ${schedule} WHERE job_id = (SELECT job_id FROM job WHERE job_name = ${JOB})`)

test({
  setup: async () => {
    await initDb()
    await setEnabled(true)
    await setSchedule('0 0 1 1 *')
    await updateJobs()
    assert.ok(getScheduled()[JOB], 'precondition: the job is scheduled after the first load')
  },
  teardown: () => cancelAll(),

  'disabling a scheduled job cancels it on the next reload': async () => {
    const task = getScheduled()[JOB].task
    await setEnabled(false)
    await updateJobs()
    assert.strictEqual(getScheduled()[JOB], undefined)
    assert.strictEqual(task.nextInvocation(), null, 'the node-schedule job no longer fires')
  },

  'a reload with the job still disabled does not throw': async () => {
    await updateJobs()
    assert.strictEqual(getScheduled()[JOB], undefined)
  },

  're-enabling the job schedules it again': async () => {
    await setEnabled(true)
    await updateJobs()
    assert.ok(getScheduled()[JOB])
    assert.notStrictEqual(getScheduled()[JOB].task.nextInvocation(), null)
  },

  'changing the schedule replaces the running job': async () => {
    const before = getScheduled()[JOB].task
    await setSchedule('0 1 1 1 *')
    await updateJobs()
    const after = getScheduled()[JOB]
    assert.strictEqual(after.schedule, '0 1 1 1 *')
    assert.notStrictEqual(after.task, before)
    assert.strictEqual(before.nextInvocation(), null, 'the replaced node-schedule job is cancelled')
    assert.notStrictEqual(after.task.nextInvocation(), null)
  },

  'a schedule that can never fire is skipped instead of breaking the reload': async () => {
    await setSchedule('0 0 31 2 *') // 31 February: node-schedule returns null for it
    await updateJobs()
    assert.strictEqual(getScheduled()[JOB], undefined)
    await setSchedule('0 1 1 1 *')
    await updateJobs()
    assert.ok(getScheduled()[JOB], 'a later valid schedule is picked up again')
  },
})

const sql = require('sql-template-strings')
const pg = require('./db/pg.js')
const cron = require('node-cron')

let scheduled = {}

const jobs = {
  updateJobs: async () => {
    console.log('Updating job schedules')
    const jobSchedules = await pg.queryRowsAsync(sql`
SELECT job_name AS name, job_schedule AS schedule FROM job NATURAL LEFT JOIN job_schedule
  `)

    for (const { name, schedule } of jobSchedules) {
      if (scheduled[name]) {
        if (scheduled[name].schedule === schedule) {
          continue
        } else {
          console.log(`Updating schedule of job '${name}'`)
          scheduled[name].task.destroy()
        }
      } else {
        console.log(`Scheduling new job '${name}' with schedule '${schedule}'`)
      }

      if (schedule === null) {
        console.log(`Canceling job '${name}'`)
        continue
      }

      scheduled[name] = {
        task: cron.schedule(schedule, jobs[name]),
        schedule
      }
    }
  },
  updateDateAddedScore: async () => {
    await pg.queryAsync(sql`
REFRESH MATERIALIZED VIEW track_date_added_score
    `)
  },
  updateDateReleasedScore: async () => {
    await pg.queryAsync(sql`
REFRESH MATERIALIZED VIEW track_date_released_score
    `)
  }
}

jobs.updateJobs()

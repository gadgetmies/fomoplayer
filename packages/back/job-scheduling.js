const sql = require('sql-template-strings')
const pg = require('./db/pg.js')
const cron = require('node-cron')
const fetchBeatportWatches = require('./jobs/fetch-beatport-watches')

pg.queryAsync(
  // language=PostgreSQL
  sql`UPDATE job_run
SET job_run_ended   = NOW(),
    job_run_success = false,
    job_run_result  = '{
      "message": "Job marked done by initialization"
    }' :: JSON
WHERE job_run_ended IS NULL
`
)

let scheduled = {}

const runJob = async jobName => {
  console.log(`Running job ${jobName}`)

  const [{ running }] = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`SELECT EXISTS(SELECT 1
            FROM job_run
                     NATURAL JOIN job
            WHERE job_name = ${jobName}
              AND job_run_ended IS NULL
         ) AS running`
  )

  if (running) {
    console.log(`Previous run of job ${jobName} still in progress`)
    return
  }

  const [{ job_run_id }] = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`INSERT INTO job_run (job_id)
SELECT job_id
FROM job
WHERE job_name = ${jobName}
RETURNING job_run_id`
  )

  let result
  let success
  try {
    success = true
    result = await jobs[jobName]()
  } catch (e) {
    success = false
    result = e
    console.error(`Job ${jobName} run failed (job_run_id: ${job_run_id}). Check job_run_result for details`)
  }

  await pg.queryAsync(
    // language=PostgreSQL
    sql`UPDATE job_run
SET job_run_ended   = NOW(),
  job_run_success = ${success},
  job_run_result  = ${result}
WHERE job_run_id = ${job_run_id}`
  )

  console.log(`Job ${jobName} run complete`)
}

const jobs = {
  updateJobs: async () => {
    console.log('Updating job schedules')
    await pg.queryAsync(
    // language=PostgreSQL
      sql`DELETE
FROM job_run
WHERE (job_run_started < NOW() - interval '10 days' AND job_run_success = TRUE)
   OR (job_run_started < NOW() - interval '20 days' AND job_run_success = FALSE)`
    )

    const jobSchedules = await pg.queryRowsAsync(sql`
SELECT job_name AS name, job_schedule AS schedule FROM job NATURAL LEFT JOIN job_schedule
  `)

    for (const { name, schedule } of jobSchedules) {
      if (scheduled[name]) {
        if (scheduled[name].schedule === schedule) {
          continue
        } else {
          console.log(`Updating schedule of job '${name}' to ${schedule}`)
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
        task: cron.schedule(schedule, () => runJob(name)),
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
  },
  fetchBeatportWatches: async () => {
    try {
      await fetchBeatportWatches()
    } catch (e) {
      console.error('Failed refreshing Beatport watches', e)
    }
  }
}

jobs.updateJobs()

module.exports = runJob

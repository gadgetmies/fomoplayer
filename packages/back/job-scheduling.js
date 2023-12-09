const sql = require('sql-template-strings')
const pg = require('./db/pg.js')
const cron = require('node-cron')
const fetchBeatportWatches = require('./jobs/watches/fetch-beatport-watches')
const fetchSpotifyWatches = require('./jobs/watches/fetch-spotify-watches')
const fetchBandcampWatches = require('./jobs/watches/fetch-bandcamp-watches')
const { sendNextEmailBatch } = require('./services/mailer')
const { updateNotifications } = require('./jobs/notifications')
const { updateTrackDetails } = require('./jobs/track_details')
const {
  updateDateReleasedScore,
  updateDatePublishedScore,
  updateDateAddedScore,
  updatePurchasedScores
} = require('./jobs/scores')
const { findMatchingTracks } = require('./jobs/find-matching-tracks')
const { syncCarts } = require('./jobs/cart-sync')
const logger = require('./logger')(__filename)

const init = async () => {
  await pg.queryAsync(
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

  await jobs.updateJobs()
}

let scheduled = {}

const runJob = async jobName => {
  logger.info(`Running job ${jobName}`)

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
    logger.info(`Previous run of job ${jobName} still in progress`)
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
    const res = await jobs[jobName]({ id: job_run_id, name: jobName })
    result = res.result
    success = res.success
  } catch (e) {
    success = false
    result = { error: e.toString() }
    logger.error(`Job ${jobName} run failed (job_run_id: ${job_run_id}). Check job_run_result for details`)
  }

  const res = typeof result === 'object' ? result : { result }

  await pg.queryAsync(
    // language=PostgreSQL
    sql`UPDATE job_run
SET job_run_ended   = NOW(),
  job_run_success = ${success},
  job_run_result  = ${JSON.stringify(res)}
WHERE job_run_id = ${job_run_id}`
  )

  logger.info(`Job ${jobName} run complete`)
}

const jobs = {
  updateJobs: async () => {
    logger.info('Updating job schedules')
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

    for (const scheduledName of Object.keys(scheduled)) {
      if (!jobSchedules.find(({ name }) => name === scheduledName)) {
        logger.info(`Removing schedule of job '${scheduledName}'`)
        scheduled[scheduledName].task.stop()
        delete scheduled[scheduledName]
      }
    }

    for (const { name, schedule } of jobSchedules) {
      if (scheduled[name]) {
        if (scheduled[name].schedule === schedule) {
          continue
        } else {
          logger.info(`Updating schedule of job '${name}' to ${schedule}`)
          scheduled[name].task.stop()
        }
      } else {
        logger.info(`Scheduling new job '${name}' with schedule '${schedule}'`)
      }

      if (schedule === null) {
        logger.info(`Canceling job '${name}'`)
        continue
      }

      scheduled[name] = {
        task: cron.schedule(schedule, () => runJob(name)),
        schedule
      }
    }

    return { success: true }
  },
  updateDateAddedScore,
  updateDateReleasedScore,
  updateDatePublishedScore,
  updatePurchasedScores,
  fetchBeatportWatches,
  fetchSpotifyWatches,
  fetchBandcampWatches,
  sendNextEmailBatch,
  updateNotifications,
  updateTrackDetails,
  syncCarts,
  findMatchingTracks
}

module.exports = {
  init,
  runJob
}

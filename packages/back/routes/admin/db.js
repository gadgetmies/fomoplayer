const sql = require('sql-template-strings')
const R = require('ramda')
const pg = require('fomoplayer_shared').db.pg
const logger = require('fomoplayer_shared').logger(__filename)
const { using } = require('bluebird')
const config = require('../../config')

module.exports.mergeTracks = async ({ trackToBeDeleted, trackToKeep }) => {
  await pg.queryAsync(sql`
-- Merge tracks
SELECT merge_tracks(${trackToBeDeleted}, ${trackToKeep});
  `)
}

module.exports.queryJobLinks = async () => {
  const [{ urls }] = await pg.queryRowsAsync(
    sql`-- queryJobLinks
SELECT STRING_AGG(${`<a href="${config.apiURL}/admin/jobs/`} || job_name || '/run">' || job_name || '</a>', '<br/>') AS urls
FROM job
      `
  )
  return urls
}

module.exports.getQueryResults = async () =>
  await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`
      -- Query radiator results
      SELECT job_name
           , ARRAY_AGG(JSON_BUILD_OBJECT('started', job_run_started, 'success', job_run_success, 'result',
                                         job_run_result)) AS results
      FROM
        job
        NATURAL JOIN job_run
      WHERE job_name LIKE '%.sql'
        AND job_run_started > NOW() - INTERVAL '1 week'
      GROUP BY job_name
    `
  )

const sql = require('sql-template-strings')
const R = require('ramda')
const pg = require('../../db/pg.js')
const logger = require('../../logger')(__filename)
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

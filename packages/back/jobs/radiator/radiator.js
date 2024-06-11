const { readFileSync, readdirSync } = require('fs')
const { pg } = require('fomoplayer_shared').db
const sql = require('sql-template-strings')
const path = require('path')
const logger = require('fomoplayer_shared').logger(__filename)

const queriesPath = `${__dirname}/queries/`
const queryFiles = readdirSync(path.resolve(queriesPath))

module.exports = Object.fromEntries(
  queryFiles
    .map((file) => [file, readFileSync(`${queriesPath}/${file}`, 'utf8')])
    .map(([file, query]) => {
      logger.info(`Initialising radiator query job for: ${file}`)
      return [
        file,
        async () => {
          try {
            return { result: await pg.queryRowsAsync(query), success: true }
          } catch (e) {
            return { result: [e], success: false }
          }
        },
      ]
    }),
)
;(async () => {
  for (const file of queryFiles) {
    await pg.queryAsync(sql`
      -- Ensure radiator job exists
      INSERT INTO job (job_name)
      VALUES (${file})
      ON CONFLICT DO NOTHING
    `)
    await pg.queryAsync(
      sql`
        -- Ensure radiator job is scheduled
        INSERT INTO job_schedule (job_id, job_schedule)
        SELECT job_id, '0 6 * * *'
        FROM
          job
        WHERE job_name = ${file}
        ON CONFLICT DO NOTHING
      `,
    )
  }
})()

const pg = require('fomoplayer_shared').db.pg
const logger = require('fomoplayer_shared').logger(__filename)
const config = require('../../config')
const dbConfig = require('../../database.json')
const { isDatabaseResetAllowed } = require('./database-reset-policy')

// Heroku deploys (production AND preview) run migrations through the `prod`
// db-migrate environment (see the Procfile's db-migrate:prod and database.json),
// which resolves its connection from DATABASE_URL. Reuse it so a programmatic
// reset rebuilds the schema exactly the way a deploy does.
const DB_MIGRATE_ENV = 'prod'

// A human-recognisable name for the environment being reset, used as the
// type-to-confirm token in the UI and re-validated server-side. Derived from
// runtime config/env (never a hard-coded deployment host), so it identifies the
// specific preview the operator is on.
const databaseResetEnvironmentName = () => {
  if (process.env.HEROKU_APP_NAME) return process.env.HEROKU_APP_NAME
  try {
    return new URL(config.apiURL).hostname
  } catch {
    return 'preview'
  }
}

const assertResetAllowed = () => {
  if (!isDatabaseResetAllowed(config)) {
    throw new Error('Database reset is only available in preview environments')
  }
}

// Drop and recreate the public schema, then re-run every migration. This yields
// a clean, current schema with no data — the same build a fresh deploy
// produces — rather than relying on down-migrations. Preview only; guarded
// again here as the last line of defence even though the route also checks.
const resetDatabase = async () => {
  assertResetAllowed()
  logger.warn('Admin-triggered database reset: dropping public schema', {
    operation: 'resetDatabase',
    environment: databaseResetEnvironmentName(),
  })
  await pg.queryAsync('DROP SCHEMA IF EXISTS public CASCADE')
  await pg.queryAsync('CREATE SCHEMA public')
  await pg.queryAsync('GRANT ALL ON SCHEMA public TO CURRENT_USER')

  const dbMigrate = require('db-migrate').getInstance(true, {
    config: dbConfig,
    cwd: `${__dirname}/../../`,
    env: DB_MIGRATE_ENV,
  })
  dbMigrate.silence(true)
  await dbMigrate.up()
  logger.warn('Admin-triggered database reset complete: schema rebuilt and migrations applied', {
    operation: 'resetDatabase',
    environment: databaseResetEnvironmentName(),
  })
}

module.exports = { resetDatabase, assertResetAllowed, databaseResetEnvironmentName }

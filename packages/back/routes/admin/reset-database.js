const pg = require('fomoplayer_shared').db.pg
const logger = require('fomoplayer_shared').logger(__filename)
const config = require('../../config')
const { isDatabaseResetAllowed } = require('./database-reset-policy')

// db-migrate env label. Deploys run migrations under `prod` (or `ci` in CI);
// the reset only runs in preview, which is NODE_ENV=production -> `prod`.
const DB_MIGRATE_ENV = process.env.NODE_ENV === 'ci' ? 'ci' : 'prod'

// Connection for the migration run, built to match the app's own pg pool
// (packages/shared/db/pg.js) exactly. We deliberately do NOT use database.json's
// `prod` entry: that connects via DATABASE_URL with no SSL options, but the app
// — and the schema drop below — connect via DATABASE_URL_PRIVATE with the
// DATABASE_USE_SSL / DATABASE_SELF_SIGNED_CERT settings. Where those differ
// (e.g. Railway private networking, where DATABASE_URL is a public proxy that
// requires SSL), db-migrate would otherwise fail to connect and up() would
// stall after the schema had already been dropped. db-migrate-pg passes this
// whole object to `new pg.Client(...)`, which honours connectionString + ssl
// together.
const migrationDbConfig = () => ({
  driver: 'pg',
  connectionString: process.env.DATABASE_URL_PRIVATE || process.env.DATABASE_URL,
  ssl: Boolean(process.env.DATABASE_USE_SSL)
    ? { rejectUnauthorized: !Boolean(process.env.DATABASE_SELF_SIGNED_CERT) }
    : false,
})

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
  const environment = databaseResetEnvironmentName()
  logger.warn('Admin-triggered database reset: dropping public schema', { operation: 'resetDatabase', environment })
  await pg.queryAsync('DROP SCHEMA IF EXISTS public CASCADE')
  await pg.queryAsync('CREATE SCHEMA public')
  await pg.queryAsync('GRANT ALL ON SCHEMA public TO CURRENT_USER')

  logger.warn('Admin-triggered database reset: running migrations', { operation: 'resetDatabase', environment })
  const dbMigrate = require('db-migrate').getInstance(true, {
    config: { [DB_MIGRATE_ENV]: migrationDbConfig() },
    cwd: `${__dirname}/../../`,
    env: DB_MIGRATE_ENV,
  })
  // Leave db-migrate's own logging on so migration progress reaches the
  // platform logs — this step had previously stalled invisibly.
  dbMigrate.silence(false)
  try {
    await dbMigrate.up()
  } catch (e) {
    logger.error('Admin-triggered database reset: migrations failed', {
      operation: 'resetDatabase',
      environment,
      error: e.message,
    })
    throw e
  }
  logger.warn('Admin-triggered database reset complete: schema rebuilt and migrations applied', {
    operation: 'resetDatabase',
    environment,
  })
}

module.exports = { resetDatabase, assertResetAllowed, databaseResetEnvironmentName }

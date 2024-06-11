const logger = require('../logger')(__filename)

const env = {
  dbUrl: process.env.DATABASE_URL,
  statementTimeout: process.env.STATEMENT_TIMEOUT,
  ssl: Boolean(process.env.DATABASE_USE_SSL)
    ? {
        rejectUnauthorized: !Boolean(process.env.DATABASE_SELF_SIGNED_CERT),
      }
    : false,
}

logger.info('Initiating database connection with env: ', env)
module.exports = require('pg-using-bluebird')(env)

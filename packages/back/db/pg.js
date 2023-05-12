const logger = require('../logger')(__filename)
const { DATABASE_USE_SSL, DATABASE_SELF_SIGNED_CERT, STATEMENT_TIMEOUT } = process.env
const { databaseUrl } = require('../config.js')

const env = {
  dbUrl: databaseUrl,
  statementTimeout: STATEMENT_TIMEOUT,
  ssl: Boolean(DATABASE_USE_SSL)
    ? {
        rejectUnauthorized: !Boolean(DATABASE_SELF_SIGNED_CERT)
      }
    : false
}

logger.info('Initiating database connection with env: ', env)
module.exports = require('pg-using-bluebird')(env)

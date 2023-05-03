const logger = require('../logger')(__filename)
const {
  DATABASE_URL,
  DATABASE_USE_SSL,
  DATABASE_ENDPOINT,
  DATABASE_USERNAME,
  DATABASE_SELF_SIGNED_CERT,
  DATABASE_PASSWORD,
  STATEMENT_TIMEOUT,
  DATABASE_NAME
} = process.env

const env = {
  dbUrl: DATABASE_URL || `postgres://${DATABASE_USERNAME}:${DATABASE_PASSWORD}@${DATABASE_ENDPOINT}/${DATABASE_NAME}`,
  statementTimeout: STATEMENT_TIMEOUT,
  ssl: Boolean(DATABASE_USE_SSL) ? {
    rejectUnauthorized: !Boolean(DATABASE_SELF_SIGNED_CERT)
  } : false
}

logger.info('Initiating database connection with env: ', env)
module.exports = require('pg-using-bluebird')(env)

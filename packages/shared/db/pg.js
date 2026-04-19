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

const redactUrl = (url) => {
  try {
    const u = new URL(url)
    if (u.password) u.password = '***'
    return u.toString()
  } catch {
    return '<unparseable url>'
  }
}
logger.info('Initiating database connection', { dbUrl: redactUrl(env.dbUrl), ssl: env.ssl, statementTimeout: env.statementTimeout })
module.exports = require('pg-using-bluebird')(env)

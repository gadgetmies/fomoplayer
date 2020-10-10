'use strict'

const env = {
  dbUrl: process.env.DB_URL,
  statementTimeout: process.env.STATEMENT_TIMEOUT,
}

console.log('Initiating server with env: ', env)
module.exports = require('pg-using-bluebird')(env)

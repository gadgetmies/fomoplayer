"use strict"

const BPromise = require('bluebird')
const SQL = require('sql-template-strings')
const pgrm = require('./pg.js')
const using = BPromise.using

module.exports = {
  authenticate: (username, password) =>
    using(pgrm.getConnection(), connection =>
      connection.queryAsync(
        //language=PostgreSQL
        SQL`SELECT 1
FROM meta_account
WHERE meta_account_username = lower(${username}) AND
      meta_account_passwd = crypt(${password}, meta_account_passwd)`)
        .then(result => result.rowCount === 1)
    ),
  findByUsername: username =>
    //language=PostgreSQL
    pgrm.queryRowsAsync(SQL`
      SELECT
        meta_account_username AS username,
        meta_account_details  AS details
      FROM meta_account
      WHERE meta_account_username = lower(${username})`)
      .then(([details]) => {
        if (!details) {
          throw new Error(`User not found with username: ${username}`)
        }
        return details
      })
}

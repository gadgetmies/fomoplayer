"use strict"

const BPromise = require('bluebird')
const sql = require('sql-template-strings')
const pgrm = require('./pg.js')
const using = BPromise.using

const accountAPI = {
  authenticate: (username, password) =>
    using(pgrm.getConnection(), connection =>
      connection.queryAsync(
        //language=PostgreSQL
        sql`SELECT 1
FROM meta_account
WHERE meta_account_username = lower(${username}) AND
      meta_account_passwd = crypt(${password}, meta_account_passwd)`)
        .then(result => result.rowCount === 1)
    ),
  findByUsername: username =>
    //language=PostgreSQL
    pgrm.queryRowsAsync(sql`
      SELECT
        meta_account_user_id AS id,
        meta_account_username AS username,
        meta_account_details  AS details
      FROM meta_account
      WHERE meta_account_username = lower(${username})`)
      .then(([details]) => {
        if (!details) {
          throw new Error(`User not found with username: ${username}`)
        }
        return details
      }),
  findByIdentifier: async (issuer, subject) => {
    const [details] = await pgrm.queryRowsAsync(sql`
      SELECT
        meta_account_user_id AS id,
        meta_account_username AS username,
        meta_account_details  AS details
      FROM meta_account
      WHERE
        meta_account_user_id_issuer = ${issuer} AND
        meta_account_user_id_subject = ${subject}
      `)
    return details
  },
  findOrCreateByIdentifier: async (issuer, subject) => {
    const existingUser = await accountAPI.findByIdentifier(issuer, subject)
    if (existingUser) {
      return existingUser
    } else {
      const [newUser] = await pgrm.queryRowsAsync(sql`
        INSERT INTO meta_account
          (meta_account_username, meta_account_user_id_issuer, meta_account_user_id_subject, meta_account_passwd)
        VALUES
          (${subject}, ${issuer}, ${subject}, 'No password for token auth')
        RETURNING meta_account_username, meta_account_details
        `)
      return newUser
    }
  }
}

module.exports = accountAPI

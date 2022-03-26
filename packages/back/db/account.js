'use strict'

const BPromise = require('bluebird')
const sql = require('sql-template-strings')
const pgrm = require('./pg.js')
const using = BPromise.using

const accountAPI = {
  authenticate: async (username, password) => {
    const result = await pgrm.queryAsync(
      //language=PostgreSQL
      sql`SELECT meta_account_user_id AS id
              FROM meta_account
                       NATURAL JOIN meta_account__authentication_method_details
                       NATURAL JOIN authentication_method
              WHERE authentication_method_code = 'email'
                AND meta_account__authentication_method_details_details ->> 'username' = lower(${username})
                AND meta_account__authentication_method_details_details ->> 'password' =
                    crypt(${password}, meta_account__authentication_method_details_details ->> 'password')`
    )
    if (result.rowCount === 1) {
      return result.rows[0]
    } else {
      return false
    }
  },
  findByUserId: async id => {
    const [details] = await pgrm.queryRowsAsync(
      //language=PostgreSQL
      sql`SELECT meta_account_user_id AS id,
       meta_account_details AS details
FROM meta_account
         NATURAL JOIN meta_account__authentication_method_details
         NATURAL JOIN authentication_method
WHERE meta_account_user_id = ${id}`
    )
    if (!details) {
      throw new Error(`User not found with id: ${id}`)
    }
    return details
  },
  findByIdentifier: async (issuer, subject) => {
    const [details] = await pgrm.queryRowsAsync(
      //language=PostgreSQL
      sql`SELECT meta_account_user_id AS id,
       meta_account_details AS details
FROM meta_account
         NATURAL JOIN meta_account__authentication_method_details
         NATURAL JOIN authentication_method
WHERE authentication_method_code = 'oidc'
  AND meta_account__authentication_method_details_details ->> 'issuer' = ${issuer}
  AND meta_account__authentication_method_details_details ->> 'subject' = ${subject}
      `
    )
    return details
  },
  findOrCreateByIdentifier: async (issuer, subject) => {
    if (!issuer || !subject) {
      throw new Error('OICD issuer or subject not set!')
    }
    const issuerWithoutProtocol = issuer.replace('https://', '')
    const existingUser = await accountAPI.findByIdentifier(issuerWithoutProtocol, subject)
    if (existingUser) {
      return existingUser
    } else {
      const [newUser] = await pgrm.queryRowsAsync(
        //language=PostgreSQL
        sql`WITH account AS (INSERT INTO meta_account DEFAULT VALUES
    RETURNING meta_account_user_id)
INSERT
INTO meta_account__authentication_method_details (meta_account_user_id, authentication_method_id,
                                                  meta_account__authentication_method_details_details)
SELECT meta_account_user_id,
       authentication_method_id,
       json_build_object('issuer', ${issuer} :: TEXT, 'subject', ${subject} :: TEXT)
FROM account,
     authentication_method
WHERE authentication_method_code = 'oidc'
RETURNING meta_account_user_id AS id
        `
      )

      const id = newUser.id
      await accountAPI.initializeNewUser(id)

      return newUser
    }
  },
  initializeNewUser: async userId => {
    await pgrm.queryRowsAsync(
      // language=PostgreSQL
      sql`-- insert default weights 
      INSERT INTO user_track_score_weight
      (user_track_score_weight_multiplier, user_track_score_weight_code, meta_account_user_id)
      VALUES (1, 'label', ${userId}),
             (5, 'artist', ${userId}),
             (1, 'label_follow', ${userId}),
             (5, 'artist_follow', ${userId}),
             (-0.1, 'date_published', ${userId}),
             (-0.1, 'date_added', ${userId})
      `
    )

    await pgrm.queryRowsAsync(
      // language=PostgreSQL
      sql`-- Add default cart
      INSERT INTO cart
          (cart_name, meta_account_user_id, cart_is_default)
      VALUES ('Default', ${userId}, TRUE)
      `
    )
  }
}

module.exports = accountAPI

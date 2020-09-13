const sql =require('sql-template-strings')

const removeIgnoredTracksFromUser = (tx, username) =>
  tx.queryRowsAsync(
// language=PostgreSQL
    sql`
DELETE FROM user__track
WHERE track_id IN (
  SELECT track_id
  FROM user__artist__label_ignore
    NATURAL JOIN meta_account
    NATURAL JOIN artist
    NATURAL JOIN label
    NATURAL JOIN track__label
    NATURAL JOIN track__artist
    NATURAL JOIN track
  WHERE meta_account_username = ${username}
)
`)

module.exports = removeIgnoredTracksFromUser

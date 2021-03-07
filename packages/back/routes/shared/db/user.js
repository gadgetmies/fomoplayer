const { using } = require('bluebird')
const sql = require('sql-template-strings')

const pg = require('../../../db/pg.js')

module.exports.removeIgnoredTracksFromUser = (tx, username) =>
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
`
  )

module.exports.insertUserPlaylistFollow = async (userId, storeName, playlistId, playlistTitle) => {
  return using(pg.getTransaction(), async tx => {
    const res = await tx.queryRowsAsync(
      // language=PostgreSQL
      sql`SELECT playlist_id AS id
FROM playlist
WHERE playlist_store_id = ${playlistId}
  AND store_id = (SELECT store_id FROM store WHERE store_name = ${storeName})
`
    )

    let id
    if (res.length === 1) {
      id = res[0].id
    } else {
      const r = await tx.queryRowsAsync(
        // language=PostgreSQL
        sql`INSERT INTO playlist (playlist_store_id, playlist_title, store_id)
    (SELECT ${playlistId}, ${playlistTitle}, store_id FROM store WHERE store_name = ${storeName})
RETURNING playlist_id AS id`
      )

      id = r[0].id
    }

    await tx.queryRowsAsync(
      // language=PostgreSQL
      sql`INSERT INTO user__playlist_watch (playlist_id, meta_account_user_id)
VALUES (${id}, ${userId})
ON CONFLICT DO NOTHING`
    )

    const [{ followId }] = await tx.queryRowsAsync(
      // language=PostgreSQL
      sql`SELECT user__playlist_watch_id AS "followId"
FROM user__playlist_watch
WHERE playlist_id = ${id}
  AND meta_account_user_id = ${userId}`
    )

    return { playlistId: id, followId }
  })
}

const { using } = require('bluebird')
const sql = require('sql-template-strings')

const pg = require('fomoplayer_shared').db.pg

module.exports.updateIgnoresInUserTracks = (tx, userIds) =>
  tx.queryRowsAsync(
    // language=PostgreSQL
    sql`-- updateIgnoresInUserTracks
WITH
  user_details AS (
    SELECT unnest(${userIds}::INTEGER[]) AS meta_account_user_id
  )

UPDATE user__track
SET user__track_ignored = NOW()
WHERE
    track_id IN (
    SELECT
      track_id
    FROM
      user_details
      NATURAL JOIN user__artist__label_ignore
      NATURAL JOIN track__label
      NATURAL JOIN track__artist
    UNION ALL
    SELECT
      track_id
    FROM
      user_details
      NATURAL JOIN user__artist_ignore
      NATURAL JOIN track__artist
    UNION ALL
    SELECT
      track_id
    FROM
      user_details
      NATURAL JOIN user__label_ignore
      NATURAL JOIN track__label
    UNION ALL
    SELECT
      track_id
    FROM
      user_details
      NATURAL JOIN user__release_ignore
      NATURAL JOIN release__track
  )
`,
  )

module.exports.insertUserPlaylistFollow = async (
  userId,
  storeName,
  playlistId,
  playlistTitle,
  playlistType = undefined,
) => {
  return using(pg.getTransaction(), async (tx) => {
    const res = await tx.queryRowsAsync(
      // language=PostgreSQL
      sql`-- insertUserPlaylistFollow SELECT playlist_id
      SELECT playlist_id AS id
      FROM
        playlist
        NATURAL JOIN store_playlist_type
      WHERE playlist_store_id = ${playlistId}
        AND (
          ((${playlistType}::TEXT IS NULL OR ${playlistType} = 'playlist') AND store_playlist_type_store_id IS NULL) OR
          store_playlist_type_store_id = ${playlistType})
        AND store_id = (SELECT store_id FROM store WHERE LOWER(store_name) = LOWER(${storeName}))
      `,
    )

    let id
    if (res.length === 1) {
      id = res[0].id
    } else {
      const r = await tx.queryRowsAsync(
        // language=PostgreSQL
        sql`-- insertUserPlaylistFollow INSERT INTO playlist
        INSERT INTO playlist
          (playlist_store_id, playlist_title, store_playlist_type_id)
          (SELECT ${playlistId}
                , ${playlistTitle}
                , store_playlist_type_id
           FROM
             store
             NATURAL JOIN store_playlist_type
           WHERE LOWER(store_name) = LOWER(${storeName})
             AND (((${playlistType}::TEXT IS NULL OR ${playlistType} = 'playlist') AND
                   store_playlist_type_store_id IS NULL) OR
                  store_playlist_type_store_id = ${playlistType}))
        RETURNING playlist_id AS id`,
      )

      id = r[0].id
    }

    await tx.queryRowsAsync(
      // language=PostgreSQL
      sql`-- insertUserPlaylistFollow INSERT INTO user__playlist_watch
INSERT INTO user__playlist_watch
  (playlist_id, meta_account_user_id)
VALUES
  (${id}, ${userId})
ON CONFLICT DO NOTHING`,
    )

    const [{ followId }] = await tx.queryRowsAsync(
      // language=PostgreSQL
      sql`-- SELECT user__playlist_watch_id
SELECT
  user__playlist_watch_id AS "followId"
FROM user__playlist_watch
WHERE
    playlist_id = ${id}
AND meta_account_user_id = ${userId}`,
    )

    return { playlistId: id, followId }
  })
}

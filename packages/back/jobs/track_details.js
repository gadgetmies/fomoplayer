const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')

module.exports.updateTrackDetails = async () => {
  await pg.queryAsync(
    // language=PostgreSQL
    sql`-- updateTrackDetails
INSERT INTO track_details (track_id, track_details_updated, track_details)
    (SELECT track_id, NOW(), row_to_json(track_details(ARRAY_AGG(track_id)))
     FROM track
              NATURAL LEFT JOIN track_details
     WHERE track_details_updated IS NULL
        OR track_details_updated < NOW() - INTERVAL '7 days'
     GROUP BY 1, track_added
     ORDER BY track_added DESC
     LIMIT 10)
ON CONFLICT ON CONSTRAINT track_details_track_id_key DO UPDATE
    SET track_details         = EXCLUDED.track_details,
        track_details_updated = NOW()
    `,
  )

  return { success: true }
}

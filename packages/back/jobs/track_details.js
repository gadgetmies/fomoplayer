const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')
const BPromise = require('bluebird')

module.exports.updateTrackDetails = async () => {
  await BPromise.using(pg.getTransaction(), async (tx) => {
    await tx.queryAsync("SET statement_timeout TO '5min'")
    // Tracks stored before track_details existed, or whose row could not be built at the time, have no row, and
    // only rows that exist are refreshed below. Only tracks with an author and a preview are picked, because
    // track_details() returns nothing for the rest and they would otherwise be retried on every run.
    await tx.queryAsync(
      // language=PostgreSQL
      sql`-- updateTrackDetails INSERT missing
INSERT INTO track_details (track_id, track_details_updated, track_details)
    (SELECT track_id, NOW(), row_to_json(track_details(ARRAY_AGG(track_id)))
     FROM track t
     WHERE NOT EXISTS (SELECT 1 FROM track_details td WHERE td.track_id = t.track_id)
       AND EXISTS (SELECT 1 FROM track__artist ta WHERE ta.track_id = t.track_id AND ta.track__artist_role = 'author')
       AND EXISTS (SELECT 1
                   FROM store__track st
                     JOIN store__track_preview stp ON stp.store__track_id = st.store__track_id
                   WHERE st.track_id = t.track_id)
     GROUP BY 1, track_added
     ORDER BY track_added DESC
     LIMIT 1000)
ON CONFLICT ON CONSTRAINT track_details_track_id_key DO NOTHING
    `,
    )
    await tx.queryAsync(
      // language=PostgreSQL
      sql`-- updateTrackDetails
INSERT INTO track_details (track_id, track_details_updated, track_details)
    (SELECT track_id, NOW(), row_to_json(track_details(ARRAY_AGG(track_id)))
     FROM track
              NATURAL LEFT JOIN track_details
     WHERE track_details_updated < NOW() - INTERVAL '7 days'
     GROUP BY 1, track_added
     ORDER BY track_added DESC
     LIMIT 1000)
ON CONFLICT ON CONSTRAINT track_details_track_id_key DO UPDATE
    SET track_details         = EXCLUDED.track_details,
        track_details_updated = NOW()
    `,
    )
  })

  return { success: true }
}

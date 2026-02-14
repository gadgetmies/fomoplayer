const sql = require('sql-template-strings')
const pg = require('fomoplayer_shared').db.pg
const logger = require('fomoplayer_shared').logger(__filename)

module.exports.findDuplicates = async () => {
  logger.info('Finding duplicate artists')
  await pg.queryAsync(sql`
    INSERT INTO suspected_duplicate_artist (artist_id_1, artist_id_2)
    SELECT a1.artist_id, a2.artist_id
    FROM artist a1
    JOIN artist a2 ON LOWER(a1.artist_name) = LOWER(a2.artist_name) AND a1.artist_id < a2.artist_id
    ON CONFLICT DO NOTHING
  `)

  logger.info('Finding duplicate tracks')
  await pg.queryAsync(sql`
    WITH track_artists AS (
        SELECT track_id, array_agg(artist_id ORDER BY artist_id) as artist_ids, array_agg(track__artist_role ORDER BY artist_id) as roles
        FROM track__artist
        GROUP BY track_id
    )
    INSERT INTO suspected_duplicate_track (track_id_1, track_id_2)
    SELECT t1.track_id, t2.track_id
    FROM track t1
    JOIN track t2 ON (
        (LOWER(t1.track_title) = LOWER(t2.track_title)
        AND (t1.track_version IS NOT DISTINCT FROM t2.track_version))
        OR (t1.track_isrc IS NOT NULL AND t1.track_isrc = t2.track_isrc)
    ) AND t1.track_id < t2.track_id
    LEFT JOIN track_artists ta1 ON t1.track_id = ta1.track_id
    LEFT JOIN track_artists ta2 ON t2.track_id = ta2.track_id
    WHERE ta1.artist_ids IS NOT DISTINCT FROM ta2.artist_ids AND ta1.roles IS NOT DISTINCT FROM ta2.roles
    ON CONFLICT DO NOTHING
  `)

  logger.info('Finding duplicate releases')
  await pg.queryAsync(sql`
    WITH release_artists AS (
        SELECT release_id, array_agg(artist_id ORDER BY artist_id) as artist_ids
        FROM release__track
        NATURAL JOIN track__artist
        GROUP BY release_id
    )
    INSERT INTO suspected_duplicate_release (release_id_1, release_id_2)
    SELECT r1.release_id, r2.release_id
    FROM release r1
    JOIN release r2 ON (
        (LOWER(r1.release_name) = LOWER(r2.release_name))
        OR (r1.release_catalog_number IS NOT NULL AND r1.release_catalog_number = r2.release_catalog_number)
        OR (r1.release_isrc IS NOT NULL AND r1.release_isrc = r2.release_isrc)
    ) AND r1.release_id < r2.release_id
    LEFT JOIN release_artists ra1 ON r1.release_id = ra1.release_id
    LEFT JOIN release_artists ra2 ON r2.release_id = ra2.release_id
    WHERE (LOWER(r1.release_name) = LOWER(r2.release_name) AND ra1.artist_ids IS NOT DISTINCT FROM ra2.artist_ids)
       OR (r1.release_catalog_number IS NOT NULL AND r1.release_catalog_number = r2.release_catalog_number)
       OR (r1.release_isrc IS NOT NULL AND r1.release_isrc = r2.release_isrc)
    ON CONFLICT DO NOTHING
  `)

  return { success: true, result: {} }
}

const pg = require('../../../db/pg.js')
const sql = require('sql-template-strings')

module.exports.searchForTracks = (query, userId) =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- searchForTracks
SELECT
  track_id AS id
, *
FROM
  track_details(
      (SELECT
         array_agg(track_id)
       FROM
         (SELECT
            track_id
          FROM
            track
            NATURAL JOIN track__artist
            NATURAL JOIN artist
            NATURAL LEFT JOIN track__label
            NATURAL LEFT JOIN label
            NATURAL JOIN store__track
          GROUP BY track_id, track_title, track_version
          HAVING
              to_tsvector(
                  'simple',
                  unaccent(track_title || ' ' ||
                           coalesce(track_version, '') || ' ' ||
                           string_agg(artist_name, ' ') || ' ' ||
                           string_agg(coalesce(label_name, ''), ' '))) @@
              websearch_to_tsquery('simple', unaccent(${query}))
          ORDER BY MAX(LEAST(store__track_published, store__track_released)) DESC 
         LIMIT 100) AS tracks)
    , ${userId})`
  )

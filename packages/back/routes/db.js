const sql = require('sql-template-strings')
const R = require('ramda')
const pg = require('../db/pg.js')
const { apiURL } = require('../config')

module.exports.getLongestPreviewForTrack = (id, format, skip) =>
  pg
    .queryRowsAsync(
      // language=PostgreSQL
      sql`
    SELECT store__track_id AS "storeTrackId" , lower(store_name) AS "storeCode"
    FROM
      store__track_preview NATURAL JOIN
      store__track  NATURAL JOIN
      store
    WHERE track_id = ${id} AND store__track_preview_format = ${format}
    ORDER BY store__track_preview_end_ms - store__track_preview_start_ms DESC NULLS LAST
    OFFSET ${skip}
    LIMIT 1;
    `
    )
    .then(R.head)

module.exports.searchForTracks = query =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`select track_id AS id, * FROM track_details(
            (SELECT array_agg(track_id)
             FROM (SELECT track_id
                   from track
                            natural join track__artist
                            natural join artist
                            natural left join track__label
                            natural left join label
                   group by track_id, track_title, track_version
                   having to_tsvector(track_title || ' ' ||
                                      coalesce(track_version, '') || ' ' ||
                                      string_agg(artist_name, ' ') || ' ' ||
                                      string_agg(coalesce(label_name, ''), ' ')) @@
                          to_tsquery(${(query.split(' ').join(' & '))})) as tracks)
        , ${apiURL})`
  )

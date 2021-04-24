-- This should match with 20210405184440-extract-function-for-track-details-query-up.sql
CREATE FUNCTION track_details(track_ids INTEGER[], api_url TEXT)
  RETURNS TABLE
          (
            track_id INTEGER,
            title    TEXT,
            heard    TIMESTAMPTZ,
            duration INTEGER,
            added    TIMESTAMPTZ,
            artists  JSON,
            version  TEXT,
            labels   JSON,
            remixers JSON,
            keys     JSON,
            previews JSON,
            stores   JSON,
            released DATE
          )
AS
$$
WITH limited_tracks AS (
  SELECT track_id
  FROM unnest(track_ids) AS track_id
)
,
     keys AS (
       SELECT lt.track_id,
              json_agg(json_build_object(
                  'system', key_system_code,
                  'key', key_name
                )) AS keys
       FROM limited_tracks lt
            NATURAL JOIN track__key
            NATURAL JOIN key_system
            NATURAL JOIN key_name
       GROUP BY 1
     ),
     authors AS (
       SELECT lt.track_id,
              json_agg(
                  json_build_object('name', a.artist_name, 'id', a.artist_id)
                ) AS authors
       FROM limited_tracks lt
            JOIN track__artist ta ON (ta.track_id = lt.track_id AND ta.track__artist_role = 'author')
            JOIN artist a ON (a.artist_id = ta.artist_id)
       GROUP BY 1
     ),
     remixers AS (
       SELECT lt.track_id,
              json_agg(
                  json_build_object('name', a.artist_name, 'id', a.artist_id)
                ) AS remixers
       FROM limited_tracks lt
            JOIN track__artist ta ON (ta.track_id = lt.track_id AND ta.track__artist_role = 'remixer')
            JOIN artist a ON (a.artist_id = ta.artist_id)
       GROUP BY 1
     ),
     previews AS (
       SELECT lt.track_id,
              json_agg(
                  json_build_object(
                      'format', store__track_preview_format,
                      'url', api_url || '/stores/' || lower(store_name) || '/tracks/' || store__track_store_id ||
                             '/preview.mp3'
                    )
                  ORDER BY store__track_preview_end_ms - store__track_preview_start_ms DESC NULLS LAST
                ) AS previews
       FROM limited_tracks lt
            NATURAL JOIN store__track
            NATURAL JOIN store__track_preview
            NATURAL LEFT JOIN store__track_preview_waveform
            NATURAL JOIN store
       GROUP BY 1
     ),
     store_tracks AS (
       SELECT distinct on (lt.track_id, store_id) track_id,
                                                  store_id,
                                                  store__track_id,
                                                  store__track_released,
                                                  store__track_url,
                                                  store_name,
                                                  store__track_store_id,
                                                  store__release_url
       FROM limited_tracks lt
            NATURAL JOIN store__track
            NATURAL JOIN store
            NATURAL LEFT JOIN release__track
            NATURAL LEFT JOIN release
            NATURAL LEFT JOIN store__release
     ),
     stores AS (
       SELECT track_id,
              min(store__track_released) as release_date,
              json_agg(
                  json_build_object(
                      'name', store_name,
                      'code', lower(store_name),
                      'id', store_id,
                      'trackId', store__track_store_id,
                      'url', store__track_url,
                      'release', json_build_object('url', store__release_url)
                    )
                )                      AS stores
       FROM store_tracks
       GROUP BY 1
     ),
     labels AS (
       SELECT track_id,
              json_agg(json_build_object('name', label_name, 'id', label_id)) AS labels
       FROM limited_tracks
            NATURAL JOIN track__label
            NATURAL JOIN label
       GROUP BY 1
     )
SELECT track_id,
       track_title                    AS title,
       user__track_heard              AS heard,
       track_duration_ms              AS duration,
       track_added                    AS added,
       authors.authors                AS artists,
       track_version                  AS version,
       CASE
         WHEN labels.labels IS NULL
           THEN '[]' :: JSON
         ELSE labels.labels END     AS labels,
       CASE
         WHEN remixers.remixers IS NULL
           THEN '[]' :: JSON
         ELSE remixers.remixers END AS remixers,
       CASE
         WHEN keys.keys IS NULL
           THEN '[]' :: JSON
         ELSE keys.keys END         AS keys,
       previews.previews              as previews,
       stores.stores,
       stores.release_date            AS released
FROM track
     NATURAL JOIN user__track
     NATURAL JOIN authors
     NATURAL JOIN previews
     NATURAL JOIN stores
     NATURAL LEFT JOIN labels
     NATURAL LEFT JOIN remixers
     NATURAL LEFT JOIN keys
WHERE track_id = ANY (track_ids)
$$ VOLATILE LANGUAGE SQL;

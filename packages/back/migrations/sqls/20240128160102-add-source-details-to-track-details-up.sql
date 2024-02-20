DROP FUNCTION IF EXISTS track_details;
CREATE FUNCTION track_details(track_ids integer[])
  returns TABLE
          (
            track_id integer,
            title    text,
            duration integer,
            added    date,
            artists  json,
            version  text,
            labels   json,
            remixers json,
            releases json,
            keys     json,
            previews json,
            stores   json,
            released date,
            published date,
            source_details json
          )
  language sql
as
$$
WITH
  limited_tracks AS (
    SELECT
      track_id
    FROM unnest(track_ids) AS track_id
  )
   , keys AS (
  SELECT
    lt.track_id
       , json_agg(json_build_object(
      'system', key_system_code,
      'key', key_name,
      'id', key_id
                  )) AS keys
  FROM
    limited_tracks lt
    NATURAL JOIN track__key
    NATURAL JOIN key_system
    NATURAL JOIN key_name
  GROUP BY 1
)
   , authors AS (
  WITH unique_authors AS (
    SELECT
      DISTINCT ON (track_id, artist_id)
      lt.track_id,
      artist_id,
      artist_name
    FROM
      limited_tracks lt
      JOIN track__artist ta ON (ta.track_id = lt.track_id AND ta.track__artist_role = 'author')
      NATURAL JOIN artist
      NATURAL LEFT JOIN store__artist
    GROUP BY 1, 2, 3
  )
  SELECT
    track_id
       , json_agg(
      json_build_object('name', artist_name, 'id', artist_id)
      ORDER BY artist_name
         ) AS authors
  FROM
    unique_authors
  GROUP BY 1
)
   , remixers AS (
  WITH unique_remixers AS (
    SELECT
      DISTINCT ON (lt.track_id, artist_id)
      lt.track_id
                                         , artist_id
                                         , artist_name
    FROM
      limited_tracks lt
      JOIN track__artist ta
           ON (ta.track_id = lt.track_id AND ta.track__artist_role = 'remixer')
      NATURAL JOIN artist
      NATURAL LEFT JOIN store__artist
    GROUP BY 1, 2, 3
  )
  SELECT
    track_id
       , json_agg(
      json_build_object('name', artist_name, 'id', artist_id)
      ORDER BY artist_name
         ) AS remixers
  FROM unique_remixers
  GROUP BY 1
)
   , previews AS (
  WITH previews_with_grouped_waveforms AS (
    SELECT lt.track_id,
      store__track_preview_id,
      store__track_preview_format,
      store_name,
      store__track_preview_url,
        store__track_preview_end_ms - store__track_preview_start_ms,
      store__track_preview_start_ms,
      store__track_preview_end_ms,
      ARRAY_REMOVE(ARRAY_AGG(store__track_preview_waveform_url), NULL) AS waveforms
    FROM limited_tracks lt
         NATURAL JOIN store__track
         NATURAL JOIN store__track_preview
         NATURAL LEFT JOIN store__track_preview_waveform
         NATURAL JOIN store
    GROUP BY 1, 2, 3, 4, 5, 6, 7, 8
  )
  SELECT track_id
       , JSON_AGG(
      JSON_BUILD_OBJECT(
          'id', store__track_preview_id,
          'format', store__track_preview_format,
          'store', LOWER(store_name),
          'url', store__track_preview_url,
          'waveforms', waveforms,
          'length_ms', store__track_preview_end_ms - store__track_preview_start_ms,
          'start_ms', store__track_preview_start_ms,
          'end_ms', store__track_preview_end_ms
      )
      ORDER BY store__track_preview_end_ms - store__track_preview_start_ms DESC NULLS LAST
         ) AS previews
  FROM previews_with_grouped_waveforms
  GROUP BY 1
)
   , store_tracks AS (
  SELECT distinct on (lt.track_id, store_id)
    track_id
                                           , store_id
                                           , store__track_id
                                           , store__track_released
                                           , store__track_published
                                           , store__track_url
                                           , store_name
                                           , store__track_store_id
                                           , store__release_url
  FROM
    limited_tracks lt
    NATURAL JOIN store__track
    NATURAL JOIN store
    NATURAL LEFT JOIN release__track
    NATURAL LEFT JOIN release
    NATURAL LEFT JOIN store__release
)
   , stores AS (
  SELECT
    track_id
       , min(store__track_released) as release_date
       , min(store__track_published) as publish_date
       , json_agg(
      json_build_object(
          'name', store_name,
          'code', lower(store_name),
          'id', store_id,
          'trackId', store__track_store_id,
          'url', store__track_url,
          'release', json_build_object('url', store__release_url)
      )
         )                        AS stores
  FROM store_tracks
  GROUP BY 1
)
   , labels AS (
  WITH unique_labels AS (
    SELECT DISTINCT ON (track_id, label_id)
      track_id
                                          , label_id
                                          , label_name
    FROM
      limited_tracks
      NATURAL JOIN track__label
      NATURAL JOIN label
      NATURAL JOIN store__label
    GROUP BY 1, 2, 3
  )
  SELECT
    track_id
       , json_agg(
      json_build_object('name', label_name, 'id', label_id)
      ORDER BY label_name
         ) AS labels
  FROM unique_labels
  GROUP BY 1
)
   , releases AS (
  SELECT
    track_id,
    json_agg(
        json_build_object('id', release_id, 'name', release_name)
    ) AS releases
  FROM limited_tracks
       NATURAL JOIN release__track
       NATURAL JOIN release
  GROUP BY 1
)
SELECT
  track_id
     , track_title                  AS title
     , track_duration_ms            AS duration
     , track_added :: DATE          AS added
     , authors.authors              AS artists
     , track_version                AS version
     , CASE
         WHEN labels.labels IS NULL
           THEN '[]' :: JSON
         ELSE labels.labels END     AS labels
     , CASE
         WHEN remixers.remixers IS NULL
           THEN '[]' :: JSON
         ELSE remixers.remixers END AS remixers
     , CASE
         WHEN releases.releases IS NULL
           THEN '[]' :: JSON
         ELSE releases.releases END AS releases
     , CASE
         WHEN keys.keys IS NULL
           THEN '[]' :: JSON
         ELSE keys.keys END         AS keys
     , previews.previews            as previews
     , stores.stores
     , stores.release_date          AS released
     , stores.publish_date          AS published
     , source_details               AS source_details
FROM
  limited_tracks
  NATURAL JOIN track
  NATURAL JOIN authors
  NATURAL JOIN previews
  NATURAL JOIN stores
  NATURAL LEFT JOIN labels
  NATURAL LEFT JOIN remixers
  NATURAL LEFT JOIN releases
  NATURAL LEFT JOIN keys
  LEFT JOIN source ON source_id = track_source
$$

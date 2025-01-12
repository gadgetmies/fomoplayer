SELECT COUNT(
    CASE
      WHEN store__track_preview_waveform_url LIKE 'https://bucket-production-4c34.up.railway.app%'
        THEN 1
    END)          AS generated
     , COUNT(CASE
               WHEN store_id = 2 AND store__track_preview_waveform_url IS NULL
                 THEN 1
             END) AS missing_bandcamp_tracks
     , COUNT(CASE
               WHEN store_id = 2 AND store__track_preview_waveform_url IS NOT NULL
                 THEN 1
             END) AS bandcamp_tracks
     , COUNT(*)   AS all_tracks
FROM
  track
  NATURAL JOIN store__track
  NATURAL JOIN store__track_preview
  NATURAL LEFT JOIN store__track_preview_waveform
WHERE store__track_preview_url IS NULL
   OR store__track_preview_url LIKE 'https://bucket-production-4c34.up.railway.app%'
;
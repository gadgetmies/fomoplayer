SELECT
    track_title
  , track_version
  , STRING_AGG(artist_name, ',')
FROM
    artist
        NATURAL JOIN track__artist
        NATURAL JOIN track
WHERE
        track_id IN (SELECT
                         track_id
                     FROM
                         track
                             NATURAL JOIN track__artist
                             NATURAL JOIN artist
                     WHERE
                         artist_name LIKE '%Remix%')
GROUP BY
    track_id, track_title, track_version;
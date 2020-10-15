CREATE TABLE duplicates AS
WITH tracks_and_artists AS (
  SELECT
    track_title,
    track_mix,
    string_agg(artist_name, ', ' ORDER BY artist_id) AS artists,
    unnest(array_agg(DISTINCT track_id)) AS tracks
  FROM
    track
    NATURAL JOIN track__artist
    NATURAL JOIN artist
  GROUP BY
    track_id
)
SELECT
  track_title,
  artists,
  track_mix,
  (
    array_agg(tracks))[1] AS remaining_track,
  unnest( array_remove(array_agg(tracks), (array_agg(tracks))[1])
) AS track_id
FROM
  tracks_and_artists
GROUP BY
  1,
  2,
  3
HAVING
  count( *) > 1
ORDER BY
  1,
  2,
  3;

UPDATE
  store__track st
SET
  track_id = (
    SELECT
      remaining_track
    FROM
      duplicates d
    WHERE
      st.track_id = d.track_id)
WHERE
  track_id IN (
    SELECT
      track_id
    FROM
      duplicates);

DELETE FROM track__artist
WHERE track_id IN (
    SELECT
      track_id
    FROM
      duplicates);

DELETE FROM track__label
WHERE track_id IN (
    SELECT
      track_id
    FROM
      duplicates);

DELETE FROM user__track
WHERE track_id IN (
    SELECT
      track_id
    FROM
      duplicates);

DELETE FROM track
WHERE track_id IN (
    SELECT
      track_id
    FROM
      duplicates);


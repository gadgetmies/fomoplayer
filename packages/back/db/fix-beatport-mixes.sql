UPDATE
  track t
SET
  track_mix = (
    SELECT
      store__track_store_details ->> 'mix'
    FROM
      store__track s
    WHERE
      s.track_id = t.track_id
    LIMIT 1)
WHERE
  track_id IN (
    SELECT
      track_id
    FROM
      track
    NATURAL JOIN store__track
  WHERE
    track_mix IS NULL
    AND store__track_store_details ->> 'mix' IS NOT NULL);

CREATE temp TABLE separated_tracks ON COMMIT DROP AS SELECT DISTINCT
  track_id, track_title, track_duration_ms, store__track_store_details ->> 'mix' AS track_mix
FROM
  track
  NATURAL JOIN store__track
WHERE
  store_id = 1
  AND lower(track_mix) != lower(store__track_store_details ->> 'mix')
ORDER BY
  track_id;

CREATE temp TABLE inserted_tracks (
  track_id integer
) ON COMMIT DROP;

WITH inserted AS (
INSERT INTO track (track_title, track_duration_ms, track_mix)
  SELECT
    track_title,
    track_duration_ms,
    track_mix
  FROM
    separated_tracks
  ORDER BY
    track_id
  RETURNING
    track_id)
  INSERT INTO inserted_tracks (track_id)
  SELECT
    *
  FROM
    inserted;

CREATE temp TABLE track_mapping ON COMMIT DROP AS
WITH inserted AS (
  SELECT
    ROW_NUMBER() OVER (ORDER BY track_id) AS o,
    track_id,
    track_title
  FROM
    inserted_tracks
    NATURAL JOIN track
),
separated AS (
SELECT
  ROW_NUMBER() OVER (ORDER BY track_id) AS o,
  track_id,
  track_title
FROM
  separated_tracks
)
SELECT
  inserted.track_id AS
  inserted_track, separated.track_id AS existing_track
FROM
  inserted
  JOIN separated USING (o
);

INSERT INTO track__label (track_id, label_id)
SELECT
  inserted_track,
  label_id
FROM
  track_mapping
  JOIN track__label ON (existing_track = track_id);

INSERT INTO track__artist (track_id, artist_id)
SELECT
  inserted_track,
  artist_id
FROM
  track_mapping
  JOIN track__artist ON (existing_track = track_id);

UPDATE
  store__track t
SET
  track_id = ( SELECT DISTINCT
      inserted_track
    FROM
      track_mapping
      JOIN separated_tracks s ON (existing_track = s.track_id)
    WHERE
      t.track_id = existing_track
      AND t.store__track_store_details ->> 'mix' = track_mix
    LIMIT 1)
WHERE
  store__track_id IN (
    SELECT
      store__track_id
    FROM
      store__track
    NATURAL JOIN separated_tracks
  WHERE
    store__track_store_details ->> 'mix' = track_mix);

SELECT
  *
FROM
  track e
  JOIN store__track est ON (e.track_id = est.track_id)
  JOIN track_mapping ON (existing_track = e.track_id)
  JOIN track i ON (inserted_track = i.track_id)
  JOIN store__track ist ON (ist.track_id = i.track_id)
WHERE
  e.track_id IN (
    SELECT
      existing_track
    FROM
      track_mapping);

SELECT DISTINCT
  track_id,
  track_title,
  track_duration_ms,
  store__track_store_details ->> 'mix' AS track_mix
FROM
  track
  NATURAL JOIN store__track
WHERE
  store_id = 1
  AND lower(track_mix) != lower(store__track_store_details ->> 'mix')
ORDER BY
  track_id;

CREATE temp TABLE separated_tracks ON COMMIT DROP AS SELECT DISTINCT
  track_id, track_title, track_duration_ms, store__track_store_details ->> 'mix' AS track_mix
FROM
  track
  NATURAL JOIN store__track
WHERE
  store_id = 1
  AND lower(track_mix) != lower(store__track_store_details ->> 'mix')
ORDER BY
  track_id;

CREATE temp TABLE inserted_tracks (
  track_id integer
) ON COMMIT DROP;

WITH inserted AS (
INSERT INTO track (track_title, track_duration_ms, track_mix)
  SELECT
    track_title,
    track_duration_ms,
    track_mix
  FROM
    separated_tracks
  ORDER BY
    track_id
  RETURNING
    track_id)
  INSERT INTO inserted_tracks (track_id)
  SELECT
    *
  FROM
    inserted;

CREATE temp TABLE track_mapping ON COMMIT DROP AS
WITH inserted AS (
  SELECT
    ROW_NUMBER() OVER (ORDER BY track_id) AS o,
    track_id,
    track_title
  FROM
    inserted_tracks
    NATURAL JOIN track
),
separated AS (
SELECT
  ROW_NUMBER() OVER (ORDER BY track_id) AS o,
  track_id,
  track_title
FROM
  separated_tracks
)
SELECT
  inserted.track_id AS
  inserted_track, separated.track_id AS existing_track
FROM
  inserted
  JOIN separated USING (o
);

INSERT INTO track__label (track_id, label_id)
SELECT
  inserted_track,
  label_id
FROM
  track_mapping
  JOIN track__label ON (existing_track = track_id);

INSERT INTO track__artist (track_id, artist_id)
SELECT
  inserted_track,
  artist_id
FROM
  track_mapping
  JOIN track__artist ON (existing_track = track_id);

UPDATE
  store__track t
SET
  track_id = ( SELECT DISTINCT
      inserted_track
    FROM
      track_mapping
      JOIN separated_tracks s ON (existing_track = s.track_id)
    WHERE
      t.track_id = existing_track
      AND t.store__track_store_details ->> 'mix' = track_mix
    LIMIT 1)
WHERE
  store__track_id IN (
    SELECT
      store__track_id
    FROM
      store__track
    NATURAL JOIN separated_tracks
  WHERE
    store__track_store_details ->> 'mix' = track_mix);

SELECT
  *
FROM
  track e
  JOIN store__track est ON (e.track_id = est.track_id)
  JOIN track_mapping ON (existing_track = e.track_id)
  JOIN track i ON (inserted_track = i.track_id)
  JOIN store__track ist ON (ist.track_id = i.track_id)
WHERE
  e.track_id IN (
    SELECT
      existing_track
    FROM
      track_mapping);

SELECT DISTINCT
  track_id,
  track_title,
  track_duration_ms,
  store__track_store_details ->> 'mix' AS track_mix
FROM
  track
  NATURAL JOIN store__track
WHERE
  store_id = 1
  AND lower(track_mix) != lower(store__track_store_details ->> 'mix')
ORDER BY
  track_id;


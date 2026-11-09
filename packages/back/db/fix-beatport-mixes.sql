UPDATE
  track t
SET
  track_version = (
    SELECT
      store__track_store_details ->> 'mix'
    FROM
      store__track s
      NATURAL JOIN store__track_store_details
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
    NATURAL JOIN store__track_store_details
  WHERE
    track_version IS NULL
    AND store__track_store_details ->> 'mix' IS NOT NULL);

-- The temp tables are dropped on commit, so each pass runs in one transaction.
BEGIN;

CREATE temp TABLE separated_tracks ON COMMIT DROP AS SELECT DISTINCT
  track_id, track_title, track_duration_ms, store__track_store_details ->> 'mix' AS track_version
FROM
  track
  NATURAL JOIN store__track
  NATURAL JOIN store__track_store_details
WHERE
  store_id = 1
  AND lower(track_version) != lower(store__track_store_details ->> 'mix')
ORDER BY
  track_id;

CREATE temp TABLE inserted_tracks (
  track_id integer
) ON COMMIT DROP;

WITH inserted AS (
INSERT INTO track (track_title, track_duration_ms, track_version)
  SELECT
    track_title,
    track_duration_ms,
    track_version
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
      AND (SELECT d.store__track_store_details ->> 'mix'
           FROM store__track_store_details d
           WHERE d.store__track_id = t.store__track_id) = track_version
    LIMIT 1)
WHERE
  store__track_id IN (
    SELECT
      store__track_id
    FROM
      store__track
    NATURAL JOIN store__track_store_details
    NATURAL JOIN separated_tracks
  WHERE
    store__track_store_details ->> 'mix' = track_version);

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

COMMIT;

SELECT DISTINCT
  track_id,
  track_title,
  track_duration_ms,
  store__track_store_details ->> 'mix' AS track_version
FROM
  track
  NATURAL JOIN store__track
  NATURAL JOIN store__track_store_details
WHERE
  store_id = 1
  AND lower(track_version) != lower(store__track_store_details ->> 'mix')
ORDER BY
  track_id;

-- The temp tables are dropped on commit, so each pass runs in one transaction.
BEGIN;

CREATE temp TABLE separated_tracks ON COMMIT DROP AS SELECT DISTINCT
  track_id, track_title, track_duration_ms, store__track_store_details ->> 'mix' AS track_version
FROM
  track
  NATURAL JOIN store__track
  NATURAL JOIN store__track_store_details
WHERE
  store_id = 1
  AND lower(track_version) != lower(store__track_store_details ->> 'mix')
ORDER BY
  track_id;

CREATE temp TABLE inserted_tracks (
  track_id integer
) ON COMMIT DROP;

WITH inserted AS (
INSERT INTO track (track_title, track_duration_ms, track_version)
  SELECT
    track_title,
    track_duration_ms,
    track_version
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
      AND (SELECT d.store__track_store_details ->> 'mix'
           FROM store__track_store_details d
           WHERE d.store__track_id = t.store__track_id) = track_version
    LIMIT 1)
WHERE
  store__track_id IN (
    SELECT
      store__track_id
    FROM
      store__track
    NATURAL JOIN store__track_store_details
    NATURAL JOIN separated_tracks
  WHERE
    store__track_store_details ->> 'mix' = track_version);

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

COMMIT;

SELECT DISTINCT
  track_id,
  track_title,
  track_duration_ms,
  store__track_store_details ->> 'mix' AS track_version
FROM
  track
  NATURAL JOIN store__track
  NATURAL JOIN store__track_store_details
WHERE
  store_id = 1
  AND lower(track_version) != lower(store__track_store_details ->> 'mix')
ORDER BY
  track_id;


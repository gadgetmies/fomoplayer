ALTER TABLE user__track
  ADD COLUMN user__track_ignored TIMESTAMPTZ
;

WITH ignored_by_artists AS
  (SELECT user__track_id
   FROM
     user__track
     NATURAL JOIN user__artist_ignore
     NATURAL JOIN track__artist)
   , ignored_by_labels AS
  (SELECT user__track_id
   FROM
     user__track
     NATURAL JOIN user__label_ignore
     NATURAL JOIN track__label)
   , ignored_by_artists_on_labels AS
  (SELECT user__track_id
   FROM
     user__track
     NATURAL JOIN user__artist__label_ignore
     NATURAL JOIN track__label
     NATURAL JOIN track__artist)
UPDATE user__track ut
SET user__track_ignored = NOW()
WHERE user__track_id IN
      (SELECT user__track_id
       FROM
         ignored_by_artists
       UNION
       SELECT user__track_id
       FROM
         ignored_by_labels
       UNION
       SELECT user__track_id
       FROM
         ignored_by_artists_on_labels)
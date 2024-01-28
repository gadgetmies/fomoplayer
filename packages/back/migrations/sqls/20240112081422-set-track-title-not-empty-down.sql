ALTER TABLE track
  DROP CONSTRAINT track_track_title_check
;

UPDATE track
SET track_title = ''
WHERE track_title = 'TITLE MISSING'
;
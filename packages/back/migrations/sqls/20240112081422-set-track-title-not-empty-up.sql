UPDATE track
SET track_title = 'TITLE MISSING'
WHERE track_title = ''
;

ALTER TABLE track
  ADD CHECK (track_title <> '')
;
UPDATE track SET track_title = substring(track_title from 0 for 99);
ALTER TABLE track
  ALTER COLUMN track_title TYPE VARCHAR(100);

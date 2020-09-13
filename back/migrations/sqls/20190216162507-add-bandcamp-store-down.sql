DELETE FROM store__track_preview
WHERE store__track_id IN (
  SELECT store__track_id
  from store__track
    natural join store
  where store_name = 'Bandcamp');

DELETE FROM store__track
WHERE store_id = (
  SELECT store_id
  from store
  where store_name = 'Bandcamp');

DELETE FROM store__artist
WHERE store_id = (
  SELECT store_id
  from store
  where store_name = 'Bandcamp');

DELETE FROM store
WHERE store_name = 'Bandcamp';

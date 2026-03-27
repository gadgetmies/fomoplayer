DELETE FROM store_playlist_type
WHERE store_id = (SELECT store_id FROM store WHERE store_name = 'Juno Download');

DELETE FROM store WHERE store_name = 'Juno Download';

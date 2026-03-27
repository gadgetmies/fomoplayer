INSERT INTO store (store_name, store_url, store_artist_regex, store_label_regex, store_search_url)
VALUES ('Juno Download', 'https://www.junodownload.com', '^https:\/\/www\.junodownload\.com\/artists\/[^/]+\/', '^https:\/\/www\.junodownload\.com\/labels\/[^/]+\/', 'https://www.junodownload.com/search/?q=');

INSERT INTO store_playlist_type (store_id, store_playlist_type_regex, store_playlist_type_store_id, store_playlist_type_label, store_playlist_type_priority)
SELECT store_id, '^https:\/\/www\.junodownload\.com\/[a-z0-9-]+\/', 'genre', 'Genre / chart', 1
FROM store WHERE store_name = 'Juno Download';

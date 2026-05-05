CREATE OR REPLACE FUNCTION merge_artists(kept_id INTEGER, deleted_id INTEGER) RETURNS VOID AS $$
BEGIN
    DELETE FROM store__artist
    WHERE artist_id = deleted_id
      AND (
        (store_id, store__artist_store_id) IN (SELECT store_id, store__artist_store_id FROM store__artist WHERE artist_id = kept_id)
        OR store__artist_url IN (SELECT store__artist_url FROM store__artist WHERE artist_id = kept_id)
      );
    UPDATE store__artist SET artist_id = kept_id WHERE artist_id = deleted_id;

    DELETE FROM track__artist
    WHERE artist_id = deleted_id
      AND (track_id, track__artist_role) IN (SELECT track_id, track__artist_role FROM track__artist WHERE artist_id = kept_id);
    UPDATE track__artist SET artist_id = kept_id WHERE artist_id = deleted_id;

    DELETE FROM artist__genre
    WHERE artist_id = deleted_id
      AND genre_id IN (SELECT genre_id FROM artist__genre WHERE artist_id = kept_id);
    UPDATE artist__genre SET artist_id = kept_id WHERE artist_id = deleted_id;

    DELETE FROM user__artist_ignore
    WHERE artist_id = deleted_id
      AND meta_account_user_id IN (SELECT meta_account_user_id FROM user__artist_ignore WHERE artist_id = kept_id);
    UPDATE user__artist_ignore SET artist_id = kept_id WHERE artist_id = deleted_id;

    DELETE FROM user__artist__label_ignore
    WHERE artist_id = deleted_id
      AND (meta_account_user_id, label_id) IN (SELECT meta_account_user_id, label_id FROM user__artist__label_ignore WHERE artist_id = kept_id);
    UPDATE user__artist__label_ignore SET artist_id = kept_id WHERE artist_id = deleted_id;

    DELETE FROM artist WHERE artist_id = deleted_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION merge_tracks(kept_id INTEGER, deleted_id INTEGER) RETURNS VOID AS $$
BEGIN
    DELETE FROM store__track
    WHERE track_id = deleted_id
      AND (
        (store_id, store__track_store_id) IN (SELECT store_id, store__track_store_id FROM store__track WHERE track_id = kept_id)
        OR store__track_url IN (SELECT store__track_url FROM store__track WHERE track_id = kept_id)
      );
    UPDATE store__track SET track_id = kept_id WHERE track_id = deleted_id;

    DELETE FROM track__artist
    WHERE track_id = deleted_id
      AND (artist_id, track__artist_role) IN (SELECT artist_id, track__artist_role FROM track__artist WHERE track_id = kept_id);
    UPDATE track__artist SET track_id = kept_id WHERE track_id = deleted_id;

    DELETE FROM track__label
    WHERE track_id = deleted_id
      AND label_id IN (SELECT label_id FROM track__label WHERE track_id = kept_id);
    UPDATE track__label SET track_id = kept_id WHERE track_id = deleted_id;

    DELETE FROM track__cart
    WHERE track_id = deleted_id
      AND cart_id IN (SELECT cart_id FROM track__cart WHERE track_id = kept_id);
    UPDATE track__cart SET track_id = kept_id WHERE track_id = deleted_id;

    DELETE FROM track__key
    WHERE track_id = deleted_id
      AND key_id IN (SELECT key_id FROM track__key WHERE track_id = kept_id);
    UPDATE track__key SET track_id = kept_id WHERE track_id = deleted_id;

    DELETE FROM track__genre
    WHERE track_id = deleted_id
      AND genre_id IN (SELECT genre_id FROM track__genre WHERE track_id = kept_id);
    UPDATE track__genre SET track_id = kept_id WHERE track_id = deleted_id;

    DELETE FROM user__track
    WHERE track_id = deleted_id
      AND meta_account_user_id IN (SELECT meta_account_user_id FROM user__track WHERE track_id = kept_id);
    UPDATE user__track SET track_id = kept_id WHERE track_id = deleted_id;

    DELETE FROM release__track
    WHERE track_id = deleted_id
      AND release_id IN (SELECT release_id FROM release__track WHERE track_id = kept_id);
    UPDATE release__track SET track_id = kept_id WHERE track_id = deleted_id;

    DELETE FROM track_details WHERE track_id = deleted_id;
    DELETE FROM track WHERE track_id = deleted_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION merge_releases(kept_id INTEGER, deleted_id INTEGER) RETURNS VOID AS $$
BEGIN
    DELETE FROM store__release
    WHERE release_id = deleted_id
      AND (
        (store_id, store__release_store_id) IN (SELECT store_id, store__release_store_id FROM store__release WHERE release_id = kept_id)
        OR store__release_url IN (SELECT store__release_url FROM store__release WHERE release_id = kept_id)
      );
    UPDATE store__release SET release_id = kept_id WHERE release_id = deleted_id;

    DELETE FROM release__track
    WHERE release_id = deleted_id
      AND track_id IN (SELECT track_id FROM release__track WHERE release_id = kept_id);
    UPDATE release__track SET release_id = kept_id WHERE release_id = deleted_id;

    DELETE FROM user__release_ignore
    WHERE release_id = deleted_id
      AND meta_account_user_id IN (SELECT meta_account_user_id FROM user__release_ignore WHERE release_id = kept_id);
    UPDATE user__release_ignore SET release_id = kept_id WHERE release_id = deleted_id;

    UPDATE release
    SET release_catalog_number = COALESCE(release_catalog_number, (SELECT release_catalog_number FROM release WHERE release_id = deleted_id)),
        release_isrc = COALESCE(release_isrc, (SELECT release_isrc FROM release WHERE release_id = deleted_id))
    WHERE release_id = kept_id;

    DELETE FROM release WHERE release_id = deleted_id;
END;
$$ LANGUAGE plpgsql;

DROP POLICY IF EXISTS query_cart ON cart;
DROP POLICY IF EXISTS query_user_track ON user__track;
DROP POLICY IF EXISTS query_user_artist_ignore ON user__artist_ignore;
DROP POLICY IF EXISTS query_user_label_ignore ON user__label_ignore;
DROP POLICY IF EXISTS query_user_artist_label_ignore ON user__artist__label_ignore;
DROP POLICY IF EXISTS query_user_release_ignore ON user__release_ignore;
DROP POLICY IF EXISTS query_store_artist_watch_user ON store__artist_watch__user;
DROP POLICY IF EXISTS query_store_label_watch_user ON store__label_watch__user;
DROP POLICY IF EXISTS query_user_playlist_watch ON user__playlist_watch;
DROP POLICY IF EXISTS query_user_search_notification ON user_search_notification;
DROP POLICY IF EXISTS query_user_track_score_weight ON user_track_score_weight;
DROP POLICY IF EXISTS query_user_notification_audio_sample ON user_notification_audio_sample;
DROP POLICY IF EXISTS query_cart_store ON cart__store;
DROP POLICY IF EXISTS query_user_search_notification_store ON user_search_notification__store;
DROP POLICY IF EXISTS query_track_cart ON track__cart;
DROP POLICY IF EXISTS query_user_notification_audio_sample_embedding ON user_notification_audio_sample_embedding;
DROP POLICY IF EXISTS query_user_notification_audio_sample_fingerprint ON user_notification_audio_sample_fingerprint;
DROP POLICY IF EXISTS query_user_notification_audio_sample_fingerprint_meta ON user_notification_audio_sample_fingerprint_meta;

ALTER TABLE cart DISABLE ROW LEVEL SECURITY;
ALTER TABLE user__track DISABLE ROW LEVEL SECURITY;
ALTER TABLE user__artist_ignore DISABLE ROW LEVEL SECURITY;
ALTER TABLE user__label_ignore DISABLE ROW LEVEL SECURITY;
ALTER TABLE user__artist__label_ignore DISABLE ROW LEVEL SECURITY;
ALTER TABLE user__release_ignore DISABLE ROW LEVEL SECURITY;
ALTER TABLE store__artist_watch__user DISABLE ROW LEVEL SECURITY;
ALTER TABLE store__label_watch__user DISABLE ROW LEVEL SECURITY;
ALTER TABLE user__playlist_watch DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_search_notification DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_track_score_weight DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_notification_audio_sample DISABLE ROW LEVEL SECURITY;
ALTER TABLE track__cart DISABLE ROW LEVEL SECURITY;
ALTER TABLE cart__store DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_search_notification__store DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_notification_audio_sample_embedding DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_notification_audio_sample_fingerprint DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_notification_audio_sample_fingerprint_meta DISABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM fomoplayer_query;
REVOKE ALL ON SCHEMA public FROM fomoplayer_query;
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'fomoplayer_query') THEN
    DROP OWNED BY fomoplayer_query;
    DROP ROLE fomoplayer_query;
  END IF;
EXCEPTION WHEN dependent_objects_still_exist THEN
  -- Role has privileges in other databases; privileges revoked in this database only.
  NULL;
END $$;

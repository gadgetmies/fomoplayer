-- Create read-only query role
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fomoplayer_query') THEN
    CREATE ROLE fomoplayer_query;
  END IF;
END $$;

-- Grant SELECT on all exposed tables to fomoplayer_query
GRANT SELECT ON
  artist, artist__genre,
  cart, cart__store,
  genre,
  key, key_name, key_system,
  label,
  playlist,
  release, release__track,
  source,
  store, store__artist, store__artist_watch, store__artist_watch__user,
  store__genre,
  store__label, store__label_watch, store__label_watch__user,
  store__release, store__track,
  store__track_preview, store__track_preview_embedding,
  store__track_preview_fingerprint, store__track_preview_fingerprint_meta,
  store__track_preview_waveform,
  store_playlist_type,
  track, track__artist, track__cart, track__genre, track__key, track__label,
  track_details,
  user__artist__label_ignore, user__artist_ignore, user__label_ignore,
  user__playlist_watch, user__release_ignore, user__track,
  user_notification_audio_sample,
  user_notification_audio_sample_embedding,
  user_notification_audio_sample_fingerprint,
  user_notification_audio_sample_fingerprint_meta,
  user_search_notification, user_search_notification__store,
  user_track_score_weight
TO fomoplayer_query;

-- Enable RLS on user-data tables (direct meta_account_user_id policy)
ALTER TABLE cart ENABLE ROW LEVEL SECURITY;
ALTER TABLE user__track ENABLE ROW LEVEL SECURITY;
ALTER TABLE user__artist_ignore ENABLE ROW LEVEL SECURITY;
ALTER TABLE user__label_ignore ENABLE ROW LEVEL SECURITY;
ALTER TABLE user__artist__label_ignore ENABLE ROW LEVEL SECURITY;
ALTER TABLE user__release_ignore ENABLE ROW LEVEL SECURITY;
ALTER TABLE store__artist_watch__user ENABLE ROW LEVEL SECURITY;
ALTER TABLE store__label_watch__user ENABLE ROW LEVEL SECURITY;
ALTER TABLE user__playlist_watch ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_search_notification ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_track_score_weight ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notification_audio_sample ENABLE ROW LEVEL SECURITY;
ALTER TABLE track__cart ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notification_audio_sample_embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notification_audio_sample_fingerprint ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notification_audio_sample_fingerprint_meta ENABLE ROW LEVEL SECURITY;

-- Direct meta_account_user_id policies
CREATE POLICY query_cart ON cart FOR SELECT TO fomoplayer_query
  USING (meta_account_user_id = current_setting('app.current_user_id')::int);
CREATE POLICY query_user_track ON user__track FOR SELECT TO fomoplayer_query
  USING (meta_account_user_id = current_setting('app.current_user_id')::int);
CREATE POLICY query_user_artist_ignore ON user__artist_ignore FOR SELECT TO fomoplayer_query
  USING (meta_account_user_id = current_setting('app.current_user_id')::int);
CREATE POLICY query_user_label_ignore ON user__label_ignore FOR SELECT TO fomoplayer_query
  USING (meta_account_user_id = current_setting('app.current_user_id')::int);
CREATE POLICY query_user_artist_label_ignore ON user__artist__label_ignore FOR SELECT TO fomoplayer_query
  USING (meta_account_user_id = current_setting('app.current_user_id')::int);
CREATE POLICY query_user_release_ignore ON user__release_ignore FOR SELECT TO fomoplayer_query
  USING (meta_account_user_id = current_setting('app.current_user_id')::int);
CREATE POLICY query_store_artist_watch_user ON store__artist_watch__user FOR SELECT TO fomoplayer_query
  USING (meta_account_user_id = current_setting('app.current_user_id')::int);
CREATE POLICY query_store_label_watch_user ON store__label_watch__user FOR SELECT TO fomoplayer_query
  USING (meta_account_user_id = current_setting('app.current_user_id')::int);
CREATE POLICY query_user_playlist_watch ON user__playlist_watch FOR SELECT TO fomoplayer_query
  USING (meta_account_user_id = current_setting('app.current_user_id')::int);
CREATE POLICY query_user_search_notification ON user_search_notification FOR SELECT TO fomoplayer_query
  USING (meta_account_user_id = current_setting('app.current_user_id')::int);
CREATE POLICY query_user_track_score_weight ON user_track_score_weight FOR SELECT TO fomoplayer_query
  USING (meta_account_user_id = current_setting('app.current_user_id')::int);
CREATE POLICY query_user_notification_audio_sample ON user_notification_audio_sample FOR SELECT TO fomoplayer_query
  USING (meta_account_user_id = current_setting('app.current_user_id')::int);

-- Subquery policies
CREATE POLICY query_track_cart ON track__cart FOR SELECT TO fomoplayer_query
  USING (cart_id IN (
    SELECT cart_id FROM cart
    WHERE meta_account_user_id = current_setting('app.current_user_id')::int
  ));
CREATE POLICY query_user_notification_audio_sample_embedding ON user_notification_audio_sample_embedding FOR SELECT TO fomoplayer_query
  USING (user_notification_audio_sample_id IN (
    SELECT user_notification_audio_sample_id FROM user_notification_audio_sample
    WHERE meta_account_user_id = current_setting('app.current_user_id')::int
  ));
CREATE POLICY query_user_notification_audio_sample_fingerprint ON user_notification_audio_sample_fingerprint FOR SELECT TO fomoplayer_query
  USING (user_notification_audio_sample_id IN (
    SELECT user_notification_audio_sample_id FROM user_notification_audio_sample
    WHERE meta_account_user_id = current_setting('app.current_user_id')::int
  ));
CREATE POLICY query_user_notification_audio_sample_fingerprint_meta ON user_notification_audio_sample_fingerprint_meta FOR SELECT TO fomoplayer_query
  USING (user_notification_audio_sample_id IN (
    SELECT user_notification_audio_sample_id FROM user_notification_audio_sample
    WHERE meta_account_user_id = current_setting('app.current_user_id')::int
  ));

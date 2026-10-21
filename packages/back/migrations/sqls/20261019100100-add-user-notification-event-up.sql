-- One row per track that reached a user through a notification source: a search
-- subscription (written by the updateNotifications job) or a sample match
-- (written by persistSampleMatches). read_at NULL means unread; it is set when
-- the user plays the track or marks notifications read. Every source is a real
-- foreign key so unsubscribing, deleting a sample or a rescore that drops a
-- match removes the events with it.
CREATE TABLE user_notification_event
(
  user_notification_event_id         SERIAL PRIMARY KEY,
  meta_account_user_id               INTEGER     NOT NULL REFERENCES meta_account (meta_account_user_id) ON DELETE CASCADE,
  track_id                           INTEGER     NOT NULL REFERENCES track (track_id) ON DELETE CASCADE,
  user_search_notification_id        INTEGER REFERENCES user_search_notification (user_search_notification_id) ON DELETE CASCADE,
  user_notification_audio_sample_id  INTEGER,
  store__track_preview_id            INTEGER,
  user_notification_event_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_notification_event_read_at    TIMESTAMPTZ,
  FOREIGN KEY (user_notification_audio_sample_id, store__track_preview_id)
    REFERENCES user_notification_audio_sample_match (user_notification_audio_sample_id, store__track_preview_id)
    ON DELETE CASCADE,
  CONSTRAINT user_notification_event_one_source CHECK (
    num_nonnulls(user_search_notification_id, user_notification_audio_sample_id) = 1
      AND (user_notification_audio_sample_id IS NULL) = (store__track_preview_id IS NULL)
    )
);

CREATE UNIQUE INDEX user_notification_event_search_unique
  ON user_notification_event (meta_account_user_id, user_search_notification_id, track_id)
  WHERE user_search_notification_id IS NOT NULL;

CREATE UNIQUE INDEX user_notification_event_sample_unique
  ON user_notification_event (meta_account_user_id, user_notification_audio_sample_id, store__track_preview_id)
  WHERE user_notification_audio_sample_id IS NOT NULL;

CREATE INDEX idx_user_notification_event_user_id
  ON user_notification_event (meta_account_user_id, user_notification_event_id DESC);

CREATE INDEX idx_user_notification_event_unread
  ON user_notification_event (meta_account_user_id, track_id)
  WHERE user_notification_event_read_at IS NULL;

CREATE INDEX idx_user_notification_event_search_notification
  ON user_notification_event (user_search_notification_id)
  WHERE user_search_notification_id IS NOT NULL;

CREATE INDEX idx_user_notification_event_sample_match
  ON user_notification_event (user_notification_audio_sample_id, store__track_preview_id)
  WHERE user_notification_audio_sample_id IS NOT NULL;

CREATE INDEX idx_user_notification_event_track
  ON user_notification_event (track_id);

-- Faithfully restore the buggy state from 20210531091140-add-cascades so the
-- earlier migration's down step finds the schema it expects.

ALTER TABLE store__label_watch__user
  DROP CONSTRAINT IF EXISTS store__label_watch__user_store__label_watch_id_fkey;

ALTER TABLE store__label_watch
  ADD CONSTRAINT store__label_watch__user_store__label_watch_id_fkey
    FOREIGN KEY (store__label_watch_id)
    REFERENCES store__label_watch (store__label_watch_id)
    ON DELETE CASCADE;

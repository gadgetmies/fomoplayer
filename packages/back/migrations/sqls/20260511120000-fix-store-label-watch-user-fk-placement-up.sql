-- 20210531091140-add-cascades misplaced this FK on store__label_watch (where it
-- becomes a useless self-referential check) instead of store__label_watch__user.
-- Without referential integrity on the join table, deleting a watch leaves
-- orphan __user rows that later block re-inserts. Move the FK back where it
-- belongs and clean up any orphans accumulated in the meantime.

ALTER TABLE store__label_watch
  DROP CONSTRAINT IF EXISTS store__label_watch__user_store__label_watch_id_fkey;

DELETE FROM store__label_watch__user
WHERE store__label_watch_id NOT IN (SELECT store__label_watch_id FROM store__label_watch);

ALTER TABLE store__label_watch__user
  ADD CONSTRAINT store__label_watch__user_store__label_watch_id_fkey
    FOREIGN KEY (store__label_watch_id)
    REFERENCES store__label_watch (store__label_watch_id)
    ON DELETE CASCADE;

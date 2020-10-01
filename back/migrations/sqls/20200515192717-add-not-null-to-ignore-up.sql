DELETE FROM user__artist__label_ignore WHERE artist_id IS NULL OR label_id IS NULL;

ALTER TABLE user__artist__label_ignore ALTER artist_id SET NOT NULL;
ALTER TABLE user__artist__label_ignore ALTER label_id SET NOT NULL;

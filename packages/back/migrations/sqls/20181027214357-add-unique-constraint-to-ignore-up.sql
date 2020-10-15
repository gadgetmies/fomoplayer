alter table user__artist__label_ignore
  add constraint user__artist__label_ignore_unique unique (meta_account_user_id, artist_id, label_id);

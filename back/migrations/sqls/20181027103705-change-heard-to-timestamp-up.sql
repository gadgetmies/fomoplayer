begin;
alter table user__track
  add column temp timestamptz;
update user__track
set temp = now()
where user__track_heard = TRUE;
alter table user__track
  drop column user__track_heard;
alter table user__track
  RENAME COLUMN temp to user__track_heard;
commit;

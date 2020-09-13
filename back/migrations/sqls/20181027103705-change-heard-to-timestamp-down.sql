begin;
alter table user__track
  add column temp boolean;
update user__track
set temp = true
where user__track_heard is not null;
alter table user__track
  drop column user__track_heard;
alter table user__track
  RENAME COLUMN temp to user__track_heard;
commit;

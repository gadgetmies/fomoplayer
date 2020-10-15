begin;
alter table store__track
  drop column store__track_released;
alter table store__track
  drop column store__track_published;
commit;

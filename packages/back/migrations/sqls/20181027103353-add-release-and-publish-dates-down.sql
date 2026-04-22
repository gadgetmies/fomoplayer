begin;
alter table store__track
  drop column store__track_released;
DROP MATERIALIZED VIEW IF EXISTS track_date_published_score;
alter table store__track
  drop column store__track_published;
commit;

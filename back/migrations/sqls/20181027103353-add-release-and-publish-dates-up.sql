begin;
alter table store__track
  add column store__track_released date not null default now();
alter table store__track
  add column store__track_published date not null default now();
update store__track
set store__track_published = date(store__track_store_details -> 'date' ->> 'published');
update store__track
set store__track_released = date(store__track_store_details -> 'date' ->> 'released');
commit;

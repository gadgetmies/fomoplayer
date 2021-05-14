CREATE TABLE source
(
  source_id      SERIAL PRIMARY KEY,
  source_details JSONB
);

alter table track drop column track_source;
alter table track add column source_id integer REFERENCES source(source_id);

alter table artist drop column artist_source;
alter table artist add column source_id integer REFERENCES source(source_id);

alter table release drop column release_source;
alter table release add column source_id integer REFERENCES source(source_id);

alter table label drop column label_source;
alter table label add column source_id integer REFERENCES source(source_id);

alter table store__track drop column store__track_source;
alter table store__track add column source_id integer REFERENCES source(source_id);

alter table store__release drop column store__release_source;
alter table store__release add column source_id integer REFERENCES source(source_id);

alter table store__label drop column store__label_source;
alter table store__label add column source_id integer REFERENCES source(source_id);

alter table store__artist drop column store__artist_source;
alter table store__artist add column source_id integer REFERENCES source(source_id);

alter table store__track_preview drop column store__track_preview_source;
alter table store__track_preview add column source_id integer REFERENCES source(source_id);

alter table store__track_preview_waveform drop column store__track_preview_waveform_source;
alter table store__track_preview_waveform add column source_id integer REFERENCES source(source_id);

alter table user__track drop column user__track_source;
alter table user__track add column source_id integer REFERENCES source(source_id);

alter table track__key drop column track__key_source;
alter table track__key add column source_id integer REFERENCES source(source_id);

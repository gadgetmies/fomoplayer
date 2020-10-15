create table store__track_preview_waveform (
  store__track_preview_waveform_id  serial primary key,
  store__track_preview_id    integer references store__track_preview (store__track_preview_id),
  store__track_preview_waveform_url text
);

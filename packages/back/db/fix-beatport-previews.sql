insert into store__track_preview_waveform (store__track_preview_waveform_url, store__track_preview_id) select store__track_store_details#>>'{waveform,large,url}', store__track_preview_id from store__track natural join store__track_preview natural left join store__track_preview_waveform where store__track_preview_waveform_id is null and store_id = 1;

update store__track_preview set store__track_preview_start_ms = (select (store__track_store_details#>>'{preview,mp3,offset,start}') :: integer from store__track where store__track.store__track_id = store__track_preview.store__track_id) where store__track_preview_id in (select store__track_preview_id from store__track_preview natural join store__track where store_id = 1);

update store__track_preview set store__track_preview_end_ms = (select (store__track_store_details#>>'{preview,mp3,offset,end}') :: integer from store__track where store__track.store__track_id = store__track_preview.store__track_id) where store__track_preview_id in (select store__track_preview_id from store__track_preview natural join store__track where store_id = 1);

update track set track_duration_ms = (select (store__track_store_details->'duration'->>'milliseconds') :: integer from store__track where store__track.track_id = track.track_id and store_id = 1 limit 1);

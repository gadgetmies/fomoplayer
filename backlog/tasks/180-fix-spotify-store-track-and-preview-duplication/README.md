---
id: 180
title: Fix Spotify store track (and preview) duplication
created: 2022-06-20
---
If a track is released multiple times, it seems the api will return multiple previews. Also it seems like Spotify might be changing the preview url for the tracks.

select json_agg(store__track_id), json_agg(store__track_preview_url), json_agg(store__track_url) from store__track_preview natural join store__track where track_id = 59856;
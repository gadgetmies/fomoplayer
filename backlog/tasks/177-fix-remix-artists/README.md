---
id: 177
title: Fix (* Remix) artists
created: 2023-03-22
---
Because of a mapping error, some artists got added to the database with "Remix" in their name (e.g. "Wings Remix").

```sql
select track_title, track_version, string_agg(artist_name, ',') from artist natural join track__artist natural join track where track_id in (select track_id from track natural join track__artist natural join artist where artist_name like '%Remix%') group by track_id, track_title, track_version;
```
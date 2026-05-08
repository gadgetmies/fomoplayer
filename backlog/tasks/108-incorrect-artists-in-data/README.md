---
id: 108
title: Incorrect artists in data
created: 2026-04-22
---
a.artist_name IN ('Original Mix', 'Extended', 'Instrumental')
      OR a.artist_name ILIKE 'Live%'
      OR a.artist_name ILIKE '%Remaster'
      OR a.artist_name ILIKE '%Rework'
      OR a.artist_name ILIKE 'Album'
      OR TRIM(a.artist_name) ~* '^feat[.]?[[:space:]]*'
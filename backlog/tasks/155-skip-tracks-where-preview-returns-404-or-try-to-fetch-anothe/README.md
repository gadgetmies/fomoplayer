---
id: 155
title: Skip tracks where preview returns 404 (or try to fetch another preview)
created: 2024-09-12
---
## Current state

`packages/front/src/Preview.js:145-154` already iterates the cached
`previews` array and falls through to the next entry when the current
one errors. So the "skip" half (advance past a 404 preview without
stopping playback) is in place.

What is **not** done: actively *fetching another* preview when the
known previews are exhausted or all return 404 — e.g. asking the
backend to re-resolve a fresh Bandcamp/Spotify/Beatport preview URL
or to look up an alternate `store__track` for the same `track_id`.

## Remaining scope

- Detect when all `previews[]` for a track have failed.
- Trigger a backend re-resolve (re-scrape Bandcamp / re-query Spotify
  for a current `preview_url`, or pick another `store__track` row
  for the same `track_id`) and append the new preview to the list.
- Surface the failure clearly in the UI when no working preview can
  be found, instead of silently stalling.
---
id: 130
title: Cache track details
created: 2022-06-18
---
The tracks, carts and search queries take quite a long time as they gather all the details for the tracks using the track_details function. The details could be stored in the track table as JSON and fetched from there. This however would require the expansion of the JSONs to records, which turned out to be quite difficult.
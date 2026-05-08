---
id: 183
title: Reuse Bandcamp session id
created: 2021-08-23
---
Currently the id is fetched on each preview request, which causes latency in the preview loading. It should be possible to reuse the id and refresh it on the backend occasionally.
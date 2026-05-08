---
id: 178
title: Player does not show remixer names if version is not set
created: 2023-03-26
---
Not sure how this should even work. Usually the remixer name is in the track version, but if that is missing, should the version be set to be e.g. `remixers.join(",") + " Remix"`? Usually this happens only when the track metadata is scraped incorrectly from Bandcamp.
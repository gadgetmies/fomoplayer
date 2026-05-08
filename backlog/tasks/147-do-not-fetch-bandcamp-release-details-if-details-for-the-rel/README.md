---
id: 147
title: Do not fetch Bandcamp release details if details for the release url exist in database
created: 2021-08-23
---
The releases will probably not change after release (except for prerelease stuff), so no need to fetch them again. Would save a bit processing time on the server, but otherwise I guess there might not be any other benefits?
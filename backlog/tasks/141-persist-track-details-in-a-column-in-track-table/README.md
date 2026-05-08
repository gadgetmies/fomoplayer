---
id: 141
title: Persist track details in a column in track table
created: 2022-06-15
---
The track details calculation takes quite long as the database query gathers quite a significant amount of data from multiple tables. In order to make the query faster, the track details could be queried and updated in a scheduled job. This however would require refactoring the track_details function to not include the score calculation as that is user specific.
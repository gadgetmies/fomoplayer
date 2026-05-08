---
id: 168
title: Fix issues in adding Beatport releases
created: 2022-06-20
---
Adding new Beatport releases fails in some situations where the store label is not found with url. One such case is that the url of the label in the store has changed, but the id has remained the same.

Test case: https://www.beatport.com/label/20-20-ldn-recordings/51248
## MODIFIED Requirements

### Requirement: Sounds like MUST suggest artists and labels to follow

`follow` SHALL list up to 5 artists and labels that the user does not follow
in any store, chosen from those that appear most often among the returned
tracks, as `{ type: 'artist' | 'label', id, name, count, followed }` with
`followed` false, sorted by count descending and artists before labels on equal
counts. Followed artists and labels SHALL be left out before the five are
picked, so they never take a place in the list.

#### Scenario: Most frequent artist first
- **WHEN** two of three returned tracks share an artist
- **THEN** that artist is first in `follow` with `count = 2`

#### Scenario: Followed entries do not take a place
- **WHEN** the six most frequent artists and labels among the returned tracks are A to F in that order, and the user follows A, B and C
- **THEN** `follow` is D, E and F

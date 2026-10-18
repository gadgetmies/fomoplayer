## ADDED Requirements

### Requirement: Sounds like MUST return the tracks closest to a sample's audio embedding

`GET /api/me/notifications/audio-samples/:id/similar?limit` SHALL rank tracks
by cosine similarity between the sample's embedding and preview embeddings of
the same embedding type, one entry per track, excluding tracks that are
fingerprint matches of the sample and tracks the user ignores (artist, label,
release or artist-on-label). It SHALL return
`{ tracks, follow, pending: false }` where each track is in the track-list
shape plus `similarity` (0–1), ordered by similarity descending, and `limit`
is clamped to 1–100 (default 20). A sample not belonging to the caller MUST
return 404.

#### Scenario: Nearest tracks first
- **WHEN** the owner requests similar tracks and track A's preview is closer to the sample than track B's
- **THEN** A precedes B and both have a similarity between 0 and 1

#### Scenario: Matched and ignored tracks are excluded
- **WHEN** the closest track is already a fingerprint match of the sample, and the next is by an ignored artist
- **THEN** neither appears in `tracks`

#### Scenario: Sample without an embedding
- **WHEN** the sample has no embedding of the preview embedding type
- **THEN** the response is `{ tracks: [], follow: [], pending: true }`

### Requirement: Sounds like MUST suggest artists and labels to follow

`follow` SHALL list up to 5 artists and labels that appear most often among
the returned tracks, as `{ type: 'artist' | 'label', id, name, count, followed }`,
sorted by count descending, with `followed` true when the user already follows
that artist or label in any store.

#### Scenario: Most frequent artist first
- **WHEN** two of three returned tracks share an artist
- **THEN** that artist is first in `follow` with `count = 2`

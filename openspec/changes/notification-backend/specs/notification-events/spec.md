## ADDED Requirements

### Requirement: Notification events MUST be stored per user, source and track

The system SHALL provide a `user_notification_event` table with
`user_notification_event_id`, `meta_account_user_id`, `track_id`,
`user_search_notification_id` (nullable), `user_notification_audio_sample_id`
and `store__track_preview_id` (nullable, together a foreign key to
`user_notification_audio_sample_match`), `user_notification_event_created_at`
and `user_notification_event_read_at` (NULL = unread). Exactly one source MUST
be set. All foreign keys MUST cascade on delete. An event MUST be unique per
(user, search notification, track) and per (user, sample, preview).

#### Scenario: Unsubscribing removes the subscription's events
- **WHEN** a user removes a search subscription that has events
- **THEN** those events no longer exist

#### Scenario: A dropped sample match removes its event
- **WHEN** a rescore no longer returns a previously persisted match
- **THEN** the match row and its event are both removed

#### Scenario: An event with no source or two sources is rejected
- **WHEN** an insert sets neither or both sources
- **THEN** the database rejects it

### Requirement: The search-notification job MUST record an event per found track

For every subscription it processes, the job SHALL insert one event per found
track for the subscription's owner, whether or not the owner has a verified
email address. It SHALL schedule the notification email only for owners with a
verified email. Re-processing the same window MUST NOT create duplicate
events.

#### Scenario: Verified owner gets events and an email
- **WHEN** the job finds two new tracks for a verified owner's subscription
- **THEN** two events exist for that owner and one email is scheduled

#### Scenario: Unverified owner gets events but no email
- **WHEN** the job finds new tracks for an owner without a verified email
- **THEN** events exist for that owner and no email is scheduled

### Requirement: Persisting sample matches MUST record an event per new match

`persistSampleMatches` SHALL insert one event for the sample's owner for each
match row it newly inserts, and SHALL NOT insert one when it updates an
existing match.

#### Scenario: Rescore of an existing match creates no new event
- **WHEN** a sample with one persisted match is rescored with the same match
- **THEN** exactly one event exists for that match and its read state is unchanged

### Requirement: Events MUST become read only when played or marked read

An event SHALL stay unread until the user reports the track heard
(`POST /api/me/tracks/:id` with `heard: true`), which marks all of that user's
unread events for the track read, or until the user marks events read through
the API.

#### Scenario: Hearing a track marks its events read
- **WHEN** a user with two unread events for a track reports it heard
- **THEN** both events have a `read_at` and the unread count drops by two

#### Scenario: Other users' events are untouched
- **WHEN** a user reports a track heard
- **THEN** another user's unread event for the same track stays unread

### Requirement: The events API MUST list, count and mark notification events

Under `/api/me/notifications` the system SHALL provide:
`GET /events?limit&before` returning the caller's events newest first as
`{ id, createdAt, read, reason, track }`, where `reason` is
`{ type: 'search', notificationId, text, displayName }` or
`{ type: 'sample', sampleId, filename }` and `track` is in the track-list
shape; `GET /events/unread-count` returning `{ count }`; and
`POST /events/read` accepting `{ all: true }` or `{ trackIds: [...] }` and
returning `{ count }` of events marked. `limit` MUST be clamped to 1–200
(default 50); a non-integer `limit` or `before` MUST return 400.

#### Scenario: Events are paginated newest first
- **WHEN** a user with three events requests `limit=2`, then `before=<last id>`
- **THEN** the first page has the two newest events and the second page the oldest

#### Scenario: Mark all read
- **WHEN** a user posts `{ all: true }` to `/events/read`
- **THEN** the unread count becomes 0

#### Scenario: Users only see their own events
- **WHEN** a user lists events
- **THEN** no other user's events are returned

## ADDED Requirements

### Requirement: The top bar MUST link to Notifications with an unread count

The top bar SHALL show a Notifications link with a bell icon next to Discover
and Carts. When the user has unread notification events it SHALL show their
count in a badge. The count SHALL refresh at least every 60 seconds while the
page is visible, when the window regains focus, and after a track is played.

#### Scenario: Unread badge
- **WHEN** the user has 3 unread events
- **THEN** the Notifications link shows a badge with 3

#### Scenario: No badge when everything is read
- **WHEN** the user has no unread events
- **THEN** no badge is shown

### Requirement: Activity MUST list notification events newest first and play them through the player

`/notifications/activity` SHALL list the user's notification events newest
first with a New marker for unread ones, why each arrived (search, artist,
label or sample match), artist, title and label. Clicking a row SHALL play its
track in the player with "Notifications · Activity" as the source. A "Mark all
read" action SHALL mark every event read. An empty list SHALL explain where
notifications come from.

#### Scenario: Playing an unread event
- **WHEN** the user plays an unread event's track
- **THEN** it plays with "Playing from Notifications · Activity", its New marker disappears and the unread count drops

### Requirement: Samples MUST show each sample's matches and Sounds like

`/notifications/samples` SHALL list the user's audio samples with upload and
delete. For the selected sample it SHALL list its matches with New marker,
artist, title, label, matched-at time in the track and tempo difference, and
a Sounds like list with similarity and up to five artists or labels to follow.

#### Scenario: Matched at and tempo
- **WHEN** a match has offset 12.5 s in a preview starting at 2:00 and tempo factor 1.012
- **THEN** its row shows matched at 2:12 and tempo +1.2 %

### Requirement: Subscriptions MUST list what the user is notified about with bells

`/notifications/subscriptions` SHALL group subscriptions into searches, artists
and labels by display name, each with a bell that removes the subscription, and
SHALL allow adding a search subscription.

#### Scenario: Removing a subscription
- **WHEN** the user turns off the bell of a search subscription
- **THEN** the subscription is removed and disappears from the list

### Requirement: Settings MUST configure email only and offer bells on followed artists and labels

Settings' Notifications tab SHALL be named Email and contain only the email
address and its verification, with a link to the Notifications page;
`/settings/notifications` SHALL redirect to `/settings/email`. Each followed
artist and label in Settings › Following SHALL have a bell that adds or
removes the `artist:<id>` / `label:<id>` subscription for its store.

#### Scenario: Bell on a followed artist
- **WHEN** the user turns on the bell of a followed artist
- **THEN** the artist appears under Notifications › Subscriptions › Artists

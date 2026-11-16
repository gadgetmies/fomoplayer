## MODIFIED Requirements

### Requirement: Subscriptions MUST list what the user is notified about with bells

`/notifications/subscriptions` SHALL group subscriptions into searches, artists
and labels by display name, each with a bell that removes the subscription, and
SHALL allow adding a search subscription. Picking an artist or label from the
add field's matches SHALL add it to the field as a pill without subscribing;
the search SHALL be added when the user presses Enter in the empty field or
Add, so several artists and labels, and text, can be combined in one
subscription. A subscription combining terms SHALL be named by each artist's
and label's name, in the list, in Activity and in the notification email.

#### Scenario: Removing a subscription
- **WHEN** the user turns off the bell of a search subscription
- **THEN** the subscription is removed and disappears from the list

#### Scenario: Artist and label in one subscription
- **WHEN** the user picks the artist Noisia, then the label Vision Recordings, then presses Add
- **THEN** one search subscription is added, listed under Searches as "Noisia · Vision Recordings"

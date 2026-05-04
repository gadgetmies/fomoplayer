# Bandcamp track actions

Behaviour of the Fomo Player browser extension's per-track action buttons (currently "Add to Fomo Player") injected into Bandcamp release pages and track pages.

## Requirements

### Requirement: Add-to-Fomo-Player button does not navigate the page

When a user clicks the "Add to Fomo Player" button injected next to a track on a Bandcamp release page or track page, the button SHALL add the track and the browser MUST remain on the current page. The click MUST NOT trigger Bandcamp's track-row navigation.

#### Scenario: Adding from a release page keeps the user on the release

- **WHEN** the user is on a Bandcamp release page with multiple tracks and clicks the "Add to Fomo Player" button next to one of those tracks
- **THEN** the track is added to Fomo Player and the browser stays on the release page (no navigation to the track's standalone page).

#### Scenario: Adding from a track page still works

- **WHEN** the user is on a Bandcamp track page and clicks the "Add to Fomo Player" button
- **THEN** the track is added to Fomo Player without regression in behaviour.

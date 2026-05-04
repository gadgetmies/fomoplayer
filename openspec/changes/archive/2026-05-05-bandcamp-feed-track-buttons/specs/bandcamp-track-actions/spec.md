## ADDED Requirements

### Requirement: Feed-page entries expose Play, Queue, and Add-to-Fomo-Player controls

Each playable feed entry on `https://bandcamp.com/<user>/feed` (an entry whose card links out to a Bandcamp `/album/...` or `/track/...` URL) SHALL receive the same Play, Queue, and Add-to-Fomo-Player controls injected on discography tiles. Play MUST fetch the linked release, append every track to the end of the Fomo Player queue in source order, start playback of the first appended track, and not navigate the browser. Queue MUST append every track of the linked release to the end of the queue without starting playback. Add-to-Fomo-Player MUST open the cart dropdown for the linked release, matching the dropdown behaviour already defined for discography tiles.

#### Scenario: Play on a feed entry linking to an album

- **WHEN** the user is on `https://bandcamp.com/<user>/feed` and clicks Play on a feed entry whose card links to `/album/...`
- **THEN** the linked release is fetched, every track is appended to the Fomo Player queue in source order, the first appended track becomes active and playback starts, and the browser stays on the feed page.

#### Scenario: Queue on a feed entry linking to a track

- **WHEN** the user clicks Queue on a feed entry whose card links to `/track/...`
- **THEN** that single track is appended to the end of the Fomo Player queue, playback does not start automatically, and the browser stays on the feed page.

#### Scenario: Add-to-Fomo-Player on a feed entry

- **WHEN** the user clicks the Add-to-Fomo-Player control on a feed entry
- **THEN** the cart dropdown opens for the linked release with the same in-flight, success, and error feedback already defined for discography tiles.

#### Scenario: Non-playable feed entries are skipped

- **WHEN** a feed entry is a community post, "now following" notification, or any other entry without an `/album/...` or `/track/...` link
- **THEN** no Fomo Player controls are injected on that entry.

### Requirement: Feed-page injection stays idempotent and survives feed virtualisation

The feed injector SHALL be idempotent under repeated runs and SHALL
inject controls on entries that Bandcamp adds after initial render
(infinite scroll, "load more" buttons, virtualised re-mounts). Each
playable feed entry MUST contain exactly one Play, one Queue, and
one Add-to-Fomo-Player control regardless of how many times the
injection pass has run.

#### Scenario: Re-injection does not duplicate buttons

- **WHEN** the feed page mutates (Bandcamp re-renders an entry, or another script appends nodes) and the extension's injection pass runs again
- **THEN** each playable feed entry continues to expose exactly one Play, one Queue, and one Add-to-Fomo-Player control.

#### Scenario: Lazy-loaded feed entries get controls

- **WHEN** the user scrolls the feed and Bandcamp inserts further story entries into the DOM
- **THEN** the new entries receive Play, Queue, and Add-to-Fomo-Player controls within the same debounce window the other Bandcamp surfaces use.

## ADDED Requirements

### Requirement: Space MUST stay in an active entity lookup

In the pill search bars (the top bar, the Tracks search and Notifications ›
Subscriptions), while the typed text is an entity prefix (`artist:`,
`label:`, `release:`, `track:`) followed by a name that is not an id, a space
SHALL be added to the name and the lookup SHALL stay open. A space SHALL end
the term only when no entity lookup is active.

#### Scenario: A label name of two words
- **WHEN** the user types `label:Vision Recordings`
- **THEN** the lookup searches labels for "Vision Recordings" and no pill is added while typing

#### Scenario: An id ends at the space
- **WHEN** the user types `artist:123 `
- **THEN** an `artist:123` pill is added

### Requirement: Quotes MUST group an entity name

Quotes around the name of an entity term SHALL be accepted, open or closed,
and SHALL NOT be sent to the lookup. A quoted number SHALL be looked up as a
name, not used as an id.

#### Scenario: Quoted label
- **WHEN** the user types `label:"Vision Recordings"`
- **THEN** the lookup searches labels for "Vision Recordings"

### Requirement: Every pill search bar MUST say when a lookup is searching or matches nothing

While an entity lookup is active, every pill search bar SHALL show a popup
saying it is searching until the matches for the current name arrive, and
saying that nothing matches when there are none. The first match SHALL be
preselected so Enter picks it. While the lookup is searching or matches
nothing, Enter SHALL NOT add the typed text; Escape SHALL close the popup.

#### Scenario: No artist matches in the top bar
- **WHEN** the user types `artist:foo bar baz` in the top bar and no artist matches
- **THEN** a popup says no artists match “foo bar baz” and pressing Enter adds nothing

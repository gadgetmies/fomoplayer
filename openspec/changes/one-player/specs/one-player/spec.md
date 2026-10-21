## ADDED Requirements

### Requirement: Next and previous MUST follow the list the track was started from

The app SHALL remember the list a track was started from (New, Recent, Heard,
a cart, a search or the audio samples) as the playing-from source. Next, previous and end-of-track advance SHALL step through the source
list — the live list when it is the one on screen, otherwise the list as it
was when playback started — regardless of which page or list is on screen.
Starting a track from another list SHALL make that list the source.

#### Scenario: Next stays in the source list after navigating
- **WHEN** a track is playing from Discover · Recent and the user opens a cart and presses next
- **THEN** the next track of Recent plays, not a track of the cart

#### Scenario: Playing from another list switches the source
- **WHEN** the user then plays a track from the cart
- **THEN** the source becomes that cart and next steps through the cart

### Requirement: The player MUST show where the current track is playing from

The Preview panel and the docked mini player SHALL show "Playing from" followed
by the source's label, linking to the source's page.

#### Scenario: Source label and link
- **WHEN** a track is started from a search for "noisia"
- **THEN** the player shows "Playing from Search · noisia" linking to that search

### Requirement: Settings MUST show a docked mini player while a track is current

On Settings pages the player SHALL stay visible as a bar docked to the bottom of
the viewport with play/pause, previous, next, the track's artists and title,
playback progress and the playing-from link, whenever a track is current.
Navigating between the track lists and Settings SHALL NOT interrupt playback.

#### Scenario: Track keeps playing on Settings
- **WHEN** a track is playing and the user opens Settings
- **THEN** the docked bar shows the track, the audio keeps playing, and pausing from the bar pauses it

#### Scenario: No bar without a track
- **WHEN** no track has been played and the user opens Settings
- **THEN** no docked bar is shown

### Requirement: Audio samples MUST play through the app player

Playing an uploaded audio sample on Settings › Notifications SHALL play it
through the app player with the audio samples as the source, stopping whatever
was playing before. The page SHALL NOT render audio elements of its own.

#### Scenario: Sample replaces the playing track
- **WHEN** a track is playing and the user presses play on an audio sample
- **THEN** the sample plays in the player, the track stops, and the player shows "Playing from Audio samples"

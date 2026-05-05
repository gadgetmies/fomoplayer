## ADDED Requirements

### Requirement: Progress bar exposes an enlarged click hit area

The embedded player's progress bar SHALL accept seek clicks across a
hit area visibly taller than the visible 4px band. The hit area MUST
be at least 12px tall and centred vertically on the visible band, so
clicks landing immediately above or below the painted stripe still
seek the track.

#### Scenario: Click immediately above the visible band

- **WHEN** the user clicks the progress bar at a vertical offset 4px
  above the visible stripe (within the hit area but outside the
  painted 4px band)
- **THEN** the embedded player seeks to the position corresponding
  to the click's horizontal location and dispatches the
  `audio:seek` action

#### Scenario: Click on the visible band

- **WHEN** the user clicks the progress bar inside the painted 4px
  band
- **THEN** the embedded player seeks to the corresponding position
  exactly as before — no behavioural change for users who land the
  visible band

### Requirement: Visible appearance of the progress bar is unchanged

The painted progress band SHALL remain a 4px-tall horizontal stripe
with the existing background and brand-coloured fill. The enlarged
hit area MUST NOT introduce visible borders, backgrounds, or
spacing that shift neighbouring controls.

#### Scenario: Visual height matches the previous implementation

- **WHEN** the embedded player is rendered
- **THEN** the painted progress stripe has the same 4px height,
  background colour (`#2c2c2c`), and brand-coloured fill it had
  before this change

#### Scenario: Neighbouring time labels do not shift

- **WHEN** the embedded player renders the player-view row
- **THEN** the current-time and duration spans flanking the bar
  occupy the same positions they did before — the larger hit area
  does not push them apart

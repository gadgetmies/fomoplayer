## ADDED Requirements

### Requirement: Cover-overlay cart button reads "Fomo"

On Bandcamp surfaces that overlay the Fomo Player button trio on top of cover art (the discography grid `#music-grid` tiles and the feed entries), the cart-toggle button SHALL render with the label "Fomo" next to its cart icon, instead of "Add to Fomo Player". Other surfaces (release-page title section, per-track rows) MUST continue to render the cart toggle with the original "Add release to Fomo Player" / "Add to Fomo Player" label.

#### Scenario: Cover-overlay cart label is "Fomo"

- **WHEN** the extension renders the cart-toggle on a Bandcamp discography cover overlay or feed entry overlay
- **THEN** the button shows the cart icon followed by the label "Fomo".

#### Scenario: Release-page cart label is unchanged

- **WHEN** the extension renders the cart-toggle in a Bandcamp release page's title section or per-track row
- **THEN** the button shows the cart icon followed by the original "Add … to Fomo Player" label.

### Requirement: Cover-overlay buttons use the Fomo Player magenta palette

The Play, Queue, and "Fomo" buttons rendered on a Bandcamp cover overlay (discography grid tiles and feed entries) SHALL use the Fomo Player primary palette: background `#b40089`, border `#530059`, hover background `#9f0076`, text `#fff`. Buttons rendered on non-overlay surfaces (release-page title section, per-track rows) MUST continue to use the existing Bandcamp-blue palette (`#0687f5`).

#### Scenario: Overlay buttons render with the magenta palette

- **WHEN** the extension renders the Fomo Player button trio on a Bandcamp discography tile or feed entry overlay
- **THEN** each button's idle state uses the magenta palette and its hover state uses `#9f0076`.

#### Scenario: Non-overlay buttons stay on Bandcamp blue

- **WHEN** the extension renders the Fomo Player button trio on a release-page title section or per-track row
- **THEN** each button's idle state continues to use the Bandcamp-blue palette unchanged from the previous behaviour.

### Requirement: Cover-overlay wrap has a legibility backdrop

The `[data-fp-injected]` wrap mounted on a Bandcamp cover overlay (discography grid tiles and feed entries) SHALL include a semi-transparent dark backdrop (rounded pill spanning the wrap) so the button trio remains readable against any cover art behind it. Non-overlay wraps MUST NOT carry that backdrop.

#### Scenario: Overlay wrap renders with a backdrop

- **WHEN** the extension renders the `[data-fp-injected]` wrap on a Bandcamp discography tile or feed entry overlay
- **THEN** the wrap shows a semi-transparent dark rounded backdrop behind the buttons.

#### Scenario: Non-overlay wraps have no backdrop

- **WHEN** the extension renders the `[data-fp-injected]` wrap in a release-page title section or per-track row
- **THEN** the wrap has no background fill — the buttons sit directly in the row layout as before.

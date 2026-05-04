## ADDED Requirements

### Requirement: Buttons in a `[data-fp-injected]` wrap share a single vertical centre line

The Play, Queue, and Add-to-Fomo-Player buttons inside a single `[data-fp-injected]` wrap SHALL render with their visual centres on the same horizontal line within 1px of each other, on every Bandcamp surface that injects them (release-title section, per-track rows, discography overlays, and the feed). The wrap MUST anchor its inline-flex layout with `align-items: center`, and each button's shadow-host MUST present a centre-aligned layout so that intrinsic baseline differences (e.g. the cart toggle's SVG icon) cannot offset one button below the others.

#### Scenario: Per-track row buttons line up

- **WHEN** the extension renders a per-track Play / Queue / Add-to-Fomo-Player trio in a Bandcamp release page row
- **THEN** the visual centres of all three buttons sit on the same horizontal line within 1px.

#### Scenario: Release-title buttons line up

- **WHEN** the extension renders the release-title `Play release` / `Queue release` / `Add release to Fomo Player` trio
- **THEN** the visual centres of all three buttons sit on the same horizontal line within 1px.

#### Scenario: Discography-overlay buttons line up

- **WHEN** the extension renders Play / Queue / Add-to-Fomo-Player on a `#music-grid` tile overlay
- **THEN** the visual centres of all three buttons sit on the same horizontal line within 1px.

#### Scenario: SVG icon does not pull the cart toggle off-centre

- **WHEN** the cart-toggle button renders with its SVG cart icon next to its label
- **THEN** the SVG is anchored such that the button's intrinsic vertical centre matches the cue-button siblings (no baseline-induced offset).

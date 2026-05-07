## MODIFIED Requirements

### Requirement: `[data-fp-injected]` wrap carries a legibility backdrop on every surface

The `[data-fp-injected]` wrap that hosts the button trio MUST render with a transparent body and paint no decoration of its own — no `background`, no `box-shadow`, no `backdrop-filter`. The wrap is a pure layout container; legibility comes from the buttons themselves (opaque dark fill, white text, brand-magenta hover) rather than from anything the wrap draws on top of the page.

#### Scenario: Wrap paints nothing

- **WHEN** the extension renders the `[data-fp-injected]` wrap on any Bandcamp surface (release page title section, per-track row, discography tile overlay, feed entry)
- **THEN** the wrap's inline style does NOT include a `background`, `box-shadow`, or `backdrop-filter` / `-webkit-backdrop-filter` declaration painting any visible decoration
- **AND** the wrap's only visible role is to host the buttons with the existing flex layout, padding, and rounded corners

#### Scenario: Buttons stand on their own

- **WHEN** the wrap renders on any Bandcamp surface
- **THEN** the visual definition of the trio comes entirely from each button's own dark fill, white text, and rounded corners — without any darkening, blur, or shadow painted by the wrap underneath

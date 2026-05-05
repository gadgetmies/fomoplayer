## MODIFIED Requirements

### Requirement: `[data-fp-injected]` wrap carries a legibility backdrop on every surface

The `[data-fp-injected]` wrap that hosts the button trio SHALL include a semi-transparent dark rounded backdrop (`rgba(0, 0, 0, 0.45)`, `border-radius: 6px`, padding around the buttons) on every Bandcamp surface so the white-text-on-transparent buttons remain readable regardless of the underlying page chrome or cover art. The wrap's outer edge MUST be feathered with a soft outward halo (`box-shadow: 0 0 8px 2px rgba(0, 0, 0, 0.45)`) so the dark wash dissolves into the surrounding page rather than ending in a hard rectangle. The wrap MUST NOT use `backdrop-filter` to blur the page content behind the overlay — softening is applied at the overlay's perimeter only, never to what is underneath.

#### Scenario: Wrap renders with the backdrop on every surface

- **WHEN** the extension renders the `[data-fp-injected]` wrap on a release-page title section, per-track row, discography tile overlay, or feed entry
- **THEN** the wrap shows a semi-transparent dark rounded backdrop behind the buttons.

#### Scenario: Outer edge feathers into the page

- **WHEN** the wrap renders on any Bandcamp surface
- **THEN** the wrap's inline style declares a `box-shadow` with a `rgba(0, 0, 0, 0.45)` colour, an 8px blur radius, and a 2px spread so the dark wash fades outward beyond the rounded rectangle's hard boundary
- **AND** the wash itself remains `rgba(0, 0, 0, 0.45)` with `border-radius: 6px`

#### Scenario: Page content behind the overlay is not blurred

- **WHEN** the wrap renders on any Bandcamp surface
- **THEN** the wrap's inline style does NOT include `backdrop-filter` or `-webkit-backdrop-filter` declarations — page content behind the overlay renders crisply, and only the overlay's perimeter is softened

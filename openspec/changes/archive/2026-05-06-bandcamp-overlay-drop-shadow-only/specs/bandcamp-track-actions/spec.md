## MODIFIED Requirements

### Requirement: `[data-fp-injected]` wrap carries a legibility backdrop on every surface

The `[data-fp-injected]` wrap that hosts the button trio MUST render with a transparent body and only a soft drop shadow behind it (`box-shadow: 0 2px 12px 4px rgba(0, 0, 0, 0.45)` with `border-radius: 6px`). The wrap MUST NOT paint a semi-transparent dark wash, a `backdrop-filter` blur on the page content underneath, or any other visible rectangle in front of the page chrome — softening is provided by the diffuse drop shadow alone, and the buttons rely on their own brand-coloured border for definition.

#### Scenario: Wrap renders with the drop shadow on every surface

- **WHEN** the extension renders the `[data-fp-injected]` wrap on a release-page title section, per-track row, discography tile overlay, or feed entry
- **THEN** the wrap's inline style declares `box-shadow: 0 2px 12px 4px rgba(0, 0, 0, 0.45)` and `border-radius: 6px`, painting a soft-edged dark drop shadow behind the container

#### Scenario: Wrap has no visible body

- **WHEN** the wrap renders on any Bandcamp surface
- **THEN** the wrap's inline style does NOT include a `background` declaration painting a semi-transparent dark colour, and does NOT include `backdrop-filter` / `-webkit-backdrop-filter` declarations — page content directly underneath the buttons is visible without any wash or blur on top of it

#### Scenario: Drop shadow is diffuse, not a hard halo

- **WHEN** the wrap renders on any Bandcamp surface
- **THEN** the `box-shadow` value uses a 12px blur radius and a 4px spread so the shadow fades softly into the page rather than painting a sharp-edged halo

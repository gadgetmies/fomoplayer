## MODIFIED Requirements

### Requirement: `[data-fp-injected]` wrap carries a legibility backdrop on every surface

The `[data-fp-injected]` wrap that hosts the button trio SHALL include a semi-transparent dark rounded backdrop (`rgba(0, 0, 0, 0.45)`, `border-radius: 6px`, padding around the buttons) on every Bandcamp surface so the white-text-on-transparent buttons remain readable regardless of the underlying page chrome or cover art. The wrap MUST additionally apply `backdrop-filter: blur(6px)` (with the `-webkit-backdrop-filter` prefix for Safari) so the backdrop softens against light Bandcamp surfaces while staying legible on dark cover art. Browsers without `backdrop-filter` support MUST still see the dark wash alone — the prefixed and unprefixed declarations together cover Firefox, Chrome, and Safari without breaking older fallbacks.

#### Scenario: Wrap renders with the backdrop on every surface

- **WHEN** the extension renders the `[data-fp-injected]` wrap on a release-page title section, per-track row, discography tile overlay, or feed entry
- **THEN** the wrap shows a semi-transparent dark rounded backdrop behind the buttons.

#### Scenario: Backdrop blur applies on supporting browsers

- **WHEN** the wrap renders on a Bandcamp surface in Chrome, Firefox, or Safari
- **THEN** the wrap's inline style declares `backdrop-filter: blur(6px)` and `-webkit-backdrop-filter: blur(6px)` so the backdrop carries through the underlying colour
- **AND** the wash is `rgba(0, 0, 0, 0.45)` — visibly softer than the previous 0.55 wash so the blur is not fighting an opaque overlay

#### Scenario: Browser without backdrop-filter support

- **WHEN** the wrap renders in a browser that ignores `backdrop-filter`
- **THEN** the dark wash alone is visible, just as before — the buttons remain legible because the underlying `rgba(0, 0, 0, 0.45)` declaration still applies

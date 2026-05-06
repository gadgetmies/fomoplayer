## MODIFIED Requirements

### Requirement: Bandcamp button trio shares a unified palette

Every Fomo Player button injected into Bandcamp (Play, Queue, and Add-to-Fomo cart toggle, on every surface) MUST render in a single unified palette mirroring Bandcamp's own play-button treatment in the idle state: `background: rgba(0, 0, 0, 0.75)`, `color: #fff`, `border-radius: 2px`, and `border: 1px solid transparent` so layout stays stable when the hover border swaps in. On hover the button fills with the Fomo brand magenta (`#b40089`) and keeps text `#fff` — the brand colour appears at rest only via the hover state, never on the idle button. Loading and error indications continue to layer on top of this palette.

#### Scenario: Buttons render with the dark idle fill

- **WHEN** the extension renders the Fomo Player button trio on any Bandcamp surface
- **THEN** each button's idle state shows a `rgba(0, 0, 0, 0.75)` fill with white text, a 2px border-radius, and no visible coloured border

#### Scenario: Hover fills with brand magenta

- **WHEN** the user hovers any Fomo Player button on a Bandcamp surface (and the button is not disabled)
- **THEN** the button's background becomes `#b40089` and the text remains `#fff`

#### Scenario: Brand magenta is reserved for hover

- **WHEN** the buttons render at rest on any Bandcamp surface
- **THEN** the brand magenta colour does not appear as a fill, border, or accent on any idle button — it appears only when the user hovers

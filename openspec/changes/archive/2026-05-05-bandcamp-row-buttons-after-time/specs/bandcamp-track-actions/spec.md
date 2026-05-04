## ADDED Requirements

### Requirement: Per-row injected controls mount immediately after the .time span

On every Bandcamp track row that receives Fomo Player per-row controls, the `[data-fp-injected]` wrap SHALL be inserted as the immediate next sibling of the row's `.time` span. The wrap MUST NOT carry a left-margin shim — the row's natural cell spacing handles the gap. When a row has no `.time` span (e.g. unusual pre-release variants), the wrap MAY fall back to the previous append-into-cell placement so those rows continue to receive controls without regression.

#### Scenario: Wrap is .time's next sibling on a standard release row

- **WHEN** the extension injects per-row controls on a Bandcamp release page's track row
- **THEN** the row contains a `.time` span and the `[data-fp-injected]` wrap is the immediate `nextElementSibling` of that span.

#### Scenario: No left-margin shim is applied to the wrap

- **WHEN** the extension renders the per-row `[data-fp-injected]` wrap
- **THEN** the wrap's inline style does not include a `margin-left` rule.

#### Scenario: Re-injection does not duplicate the wrap

- **WHEN** the page mutates and the injection pass runs again on a row whose `[data-fp-injected]` wrap already exists
- **THEN** that row continues to expose exactly one wrap as the immediate next sibling of `.time`.

#### Scenario: Rows without .time fall back gracefully

- **WHEN** a track row has no `.time` span but is otherwise eligible for injection
- **THEN** the wrap is appended into the row's title cell so the row still exposes the Fomo Player controls.

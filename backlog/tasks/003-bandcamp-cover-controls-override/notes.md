# Notes

## Decisions

Scope was narrowed during implementation. The original brief asked for two
things — override Bandcamp's native play handlers to route through the
extension player, and add a Queue button next to the cover-overlay play
button. The user redirected to a simpler approach: since the extension
already injects its own Play / Queue / Add-to-Fomo trio on release and
feed surfaces, just **hide** Bandcamp's native play affordances rather
than rewire them.

Landed as openspec change `hide-bandcamp-native-play-button` (archived
under `openspec/changes/archive/`). The new
`bandcamp-native-play-button-visibility` capability adds an options-page
toggle (default on) that injects a `display: none !important` rule for
`.inline_player`, `.play-button`, and `.play-col`.

## Rejected approaches

- **Intercepting clicks via capture-phase listener on Bandcamp's
  selectors** — drafted in the first design pass before the scope was
  narrowed. Rejected because hiding the affordance entirely is simpler
  and avoids the risk of Bandcamp's player internals shifting under us.
- **Removing the elements from the DOM** — rejected in favour of CSS so
  Bandcamp's own scripts can still read state from the (hidden) nodes
  without surprises.

## Open threads

_(empty)_

## Session log

Implementation + archive landed together; backlog moved straight to
`done/` once the user verified the hide on `/album/...`, `/track/...`,
the `/feed` page, and confirmed the live toggle behaviour.

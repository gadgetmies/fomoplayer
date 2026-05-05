## Why

The embedded player's progress bar in the Bandcamp content-script UI
is a 4px-tall stripe with `cursor: pointer` and a click handler that
seeks to the clicked position. 4px is too thin to comfortably target,
especially on a trackpad — users have to aim precisely, which is
annoying for an action that's used often.

Increasing the click target without altering the visible bar height
makes seeking dramatically easier without adding any visual weight.

## What Changes

- Make the progress-bar element's clickable hit area visibly taller
  than the 4px visual band — a transparent ~16px hitbox centred on
  the visible stripe.
- Keep the visual rendering identical: 4px tall, brand-coloured fill,
  same horizontal placement.
- Preserve the existing click-to-seek math: `(clientX - rect.left) /
  rect.width` against `state.duration`.

## Capabilities

### Modified Capabilities

- `embedded-player-ui`: progress-bar control gains a larger click
  hit area while keeping its visible appearance unchanged.

## Impact

- `packages/browser-extension/src/js/content/bandcamp/player-ui.js`
  — `.bar` and `.bar-fill` CSS update; the `bindEvents` click
  handler is unchanged.
- No other file changes; no new dependencies; no manifest impact.

---
id: 023
title: Blur the dark backdrop behind the Bandcamp overlay button trio
effort: S
created: 2026-05-05
---

# Blur the dark backdrop behind the Bandcamp overlay button trio

## Why

The `[data-fp-injected]` wrap that hosts the Play / Queue / Add-to-Fomo
trio on Bandcamp surfaces carries a `rgba(0, 0, 0, 0.55)` rounded
backdrop (added in item 016 to keep the white-text-on-transparent
buttons readable on top of cover art and other varied page chrome).
That backdrop reads cleanly on dark backgrounds but feels heavy on
white-ish surfaces — the rectangle of dim grey sits awkwardly on a
bright tile or a light feed entry.

Adding a `backdrop-filter: blur(...)` softens the backdrop on light
surfaces by carrying through the underlying colour, while keeping the
buttons legible on dark cover art. It's a small, low-risk visual
polish that meaningfully improves how the overlay reads on the lighter
Bandcamp surfaces.

## What

- Update the wrap's inline `cssText` (currently set in
  `packages/browser-extension/src/js/content/bandcamp/inject.js:142`)
  to add `backdrop-filter: blur(6px); -webkit-backdrop-filter:
  blur(6px);` alongside the existing
  `background: rgba(0, 0, 0, 0.55)`. The unprefixed and prefixed
  declarations together cover Firefox, Chrome, and Safari without
  needing a build-time autoprefixer.
- Pick an appropriate blur radius. Start with `6px`; calibrate during
  verification against a discography tile, the feed cards, the
  `#new-releases-vm` compact tiles, and the per-track overlay rows.
- Reduce the backdrop's opacity slightly (e.g. `rgba(0, 0, 0, 0.45)`)
  so the blur isn't fighting an opaque wash. Confirm contrast on
  dark cover art still meets the same legibility bar item 016
  established before committing.
- Update the `bandcamp-track-actions` capability spec's "[data-fp-injected]
  wrap carries a legibility backdrop" requirement to mention the
  blur, so future styling work doesn't undo it without intent.

## Acceptance criteria

- [ ] On a Bandcamp release page with a light-coloured cover image,
      the trio's backdrop reads as a soft, blurred rounded rectangle
      rather than a hard grey block.
- [ ] On a Bandcamp release page with a dark cover image, the buttons
      stay legible (white text on a dark-enough backdrop), matching
      the bar item 016 set.
- [ ] On the discography grid (`#music-grid`), feed entries
      (`.track_play_auxiliary`), and per-track rows, the same blurred
      backdrop renders consistently — no surface where the blur is
      missing or visibly different.
- [ ] On a browser without `backdrop-filter` support, the wrap still
      shows the existing `rgba(0, 0, 0, 0.55)` fallback (the unprefixed
      declaration is ignored, the dark wash carries on).

## Code pointers

- `packages/browser-extension/src/js/content/bandcamp/inject.js:142`
  — the `cssText` string that the wrap uses today. Add the
  `backdrop-filter` declarations there. (Consider extracting into a
  small constant, e.g. `WRAP_BACKDROP_CSS`, if the same string ends
  up duplicated elsewhere.)
- `openspec/specs/bandcamp-track-actions/spec.md` — the
  "`[data-fp-injected]` wrap carries a legibility backdrop on every
  surface" requirement; modify it to include the blur.
- Items 016 (cover-overlay button styling) and 018 (vertical
  alignment) for context on why the wrap exists at all.

## Out of scope

- Re-skinning the buttons inside the wrap. They were calibrated in
  item 016; only the wrap's backdrop changes here.
- Adding a config option to toggle the backdrop. No knobs.
- Touching the embedded sticky player UI's backdrop — that surface
  is always dark by design.

## Open questions

- What blur radius reads best on the various surfaces? `6px` is a
  reasonable starting point; might want a tighter `4px` for the
  compact `#new-releases-vm` tiles. Verify visually before committing.
- Should the backdrop opacity drop to `0.40` / `0.45` once the blur
  is in place, or stay at `0.55`? The blur compensates for some of
  the wash, so a small opacity reduction usually looks better.
- Does adding `backdrop-filter` cost noticeable paint time on
  pages with many tiles (e.g. a full discography grid or an
  infinite-scroll feed)? Eyeball it during verification; if it's
  jank-inducing, fall back to a smaller radius.

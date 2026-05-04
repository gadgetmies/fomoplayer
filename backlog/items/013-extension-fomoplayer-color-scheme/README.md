---
id: 013
title: Use Fomo Player colour scheme in extension player and injected controls
status: todo
priority: P2
effort: M
created: 2026-05-04
depends-on: []
---

# Use Fomo Player colour scheme in extension player and injected controls

## Why

The extension currently uses a colour palette that doesn't match the Fomo
Player web UI. The integration feels like a third-party add-on rather
than part of the same product, which hurts trust and visual cohesion.

## What

- Apply the Fomo Player colour scheme to the extension player buttons
  and to the controls injected into Bandcamp pages.
- Source colours from shared design tokens rather than hard-coding hex
  values.

## Acceptance criteria

- [ ] Side-by-side, the extension's injected buttons match the Fomo
      Player web UI's button colours, hover states, and focus rings.
- [ ] Colour values are not hard-coded — they come from a shared module
      (e.g. an export from a `fomoplayer_shared` package, or a
      build-time copy step from the web UI's theme).
- [ ] No regression to layout, contrast, or accessibility.

## Code pointers

- The Fomo Player web UI's colour tokens — find the current source.
- `packages/browser-extension/` stylesheets and any inline-style usages.

## Open questions

- How should tokens be shared between the web UI and extension build?
  Options: a shared module in `fomoplayer_shared`, a build-time copy
  step, or a small CSS file emitted by the web UI build that the
  extension imports. Pick the lightest path that doesn't require
  duplication.

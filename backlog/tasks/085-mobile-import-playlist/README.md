---
id: 085
title: Import playlist flow
effort: M
created: 2026-05-07
---

# Import playlist flow

## Why

The web app has an import-playlist button that brings tracks from
external sources (Spotify) into a Fomo Player cart. Mobile users
expect the same.

## What

- Entry point: a button on the Carts tab root and inside an empty
  cart's detail.
- Source picker (Spotify is the current source; design for adding
  more).
- For Spotify: requires the integration to be linked (Settings →
  Integrations); if not, prompts to link first.
- Lists the user's playlists; selecting one imports tracks into a
  new cart (or appends to an existing one).
- Progress indicator while importing.

## Acceptance criteria

- [ ] Linked-Spotify users can import a playlist into a new cart
      end-to-end.
- [ ] Unlinked users are routed to the integration screen.
- [ ] Import is resumable / restartable on failure (don't lose
      partial progress silently).

## Code pointers

- `packages/front/src/ImportPlaylistButton.js` — current web flow.

---
id: 089
title: Spotify integration auth
effort: M
created: 2026-05-07
---

# Spotify integration auth

## Why

Importing playlists (task 085) and following Spotify playlists
require the Spotify integration. The auth dance is OAuth in a
web view.

## What

- Settings → Integrations entry kicks off Spotify OAuth via an
  in-app browser (`expo-web-browser`) hitting the existing
  backend `/api/auth/spotify` endpoint.
- After redirect, app reads the linked-account state and
  surfaces it in Settings.
- Disconnect button revokes the link via
  `/api/auth/authorizations/spotify` DELETE.

## Acceptance criteria

- [ ] First-time link redirects to Spotify, returns, and the
      Settings screen shows "Linked".
- [ ] Re-link works after disconnect.
- [ ] Linked state survives cold starts and shows up on the
      Account / Integrations screen.

## Code pointers

- `packages/back/routes/auth.js:753` — `/spotify` initiator.
- `packages/back/routes/auth.js:758` — Spotify callback.
- `packages/back/routes/users/api.js:425` — disconnect.

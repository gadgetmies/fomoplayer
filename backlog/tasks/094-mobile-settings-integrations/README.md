---
id: 094
title: Integrations & API keys
effort: M
created: 2026-05-07
---

# Integrations & API keys

## Why

Linked accounts (Spotify) and API keys for the CLI / extension
need a management surface on mobile too — even if they're set
infrequently.

## What

- Linked accounts section: Spotify state + connect / disconnect
  (delegates to task 089).
- API keys section: list of issued keys, create new key (with
  one-time reveal), revoke key.
- Keys are shown masked; revealing requires a confirmation
  (and biometric if enabled, story 041 task 062).

## Acceptance criteria

- [ ] Create-key flow surfaces the key once, never again.
- [ ] Revoke is instant and propagates.
- [ ] Linked-account state stays in sync with task 089.

## Code pointers

- `packages/back/routes/users/api-keys.js:5` — list keys.
- `packages/back/routes/users/api-keys.js:9` — delete key.

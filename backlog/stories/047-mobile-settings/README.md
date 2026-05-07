# Story 047 — Settings (all pages)

A Settings tab that mirrors the web Settings surface (following,
sorting, carts, notifications, ignores, collection, integrations,
account) using native list-detail navigation rather than the web's
single-page tabbed layout.

## User-facing change

A user opens the Settings tab and sees a list of sections, each opening
a focused detail screen. Score-weight sliders are touch-first; toggles
follow platform conventions; destructive actions (delete account,
clear heard since…) confirm via native alerts.

## Why

Settings on web is a 1800-line single-page tabbed monolith. Translating
it as-is would feel awful on a phone. Splitting per page into a native
list-detail flow is the idiomatic mobile shape.

## "Done" looks like

- Settings root list links into focused screens for each section.
- Score weights screen uses sliders / steppers and previews scoring
  impact where the web does.
- Notifications screen lists subscriptions, allows toggle/delete, and
  manages audio-sample notifications.
- Collection screen exposes "mark all heard since…" with a native
  date/interval picker, and "clear heard tracks since…" with native
  confirmation.
- Integrations screen shows linked accounts (Spotify), API keys, and
  the score-weights link.
- Account screen exposes email, sign-up status, delete-account.
- Following / ignores entries deep-link into the dedicated list
  screens from story 046 rather than duplicating them here.

## Tasks

- [090 — Settings root list & navigation](../../tasks/090-mobile-settings-root)
- [091 — Sorting / score weights](../../tasks/091-mobile-settings-sorting)
- [092 — Notifications screen](../../tasks/092-mobile-settings-notifications)
- [093 — Collection (heard tracks bulk actions)](../../tasks/093-mobile-settings-collection)
- [094 — Integrations & API keys](../../tasks/094-mobile-settings-integrations)
- [095 — Account screen](../../tasks/095-mobile-settings-account)

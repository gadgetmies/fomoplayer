# Story 046 — Follows & ignores

List + manage followed artists / labels / playlists per store, star
toggle to elevate scoring, ignore lists for artists / labels /
releases, the follow-from-row entry point, and Spotify integration
auth.

## User-facing change

A user can browse what they follow (artists / labels / playlists)
grouped by store, swipe to unfollow, tap a star to elevate scoring for
that follow, and do the same for the ignore lists (artists / labels /
releases). From any track row's long-press menu they can open a follow
sheet that searches by name or URL and follows on the matching store.
A Spotify integration entry handles OAuth in a web view and links the
account.

## Why

Follows/ignores drive the entire scoring pipeline. They're set rarely
but matter a lot when set. The web Settings → Following / Ignores
pages translate well to native list-detail navigation.

## "Done" looks like

- Follows list screen — Artists / Labels / Playlists tabs, swipe to
  unfollow, star toggle.
- Ignores list screen — Artists / Labels / Releases tabs, swipe to
  un-ignore.
- Follow sheet (reachable from any row's long-press) — search-by-name
  or paste-URL, follow per store. **Note:** task 038 fixes the web
  side of this same surface; reuse the fix.
- Spotify integration — opens a web view to complete OAuth, handles
  the redirect, surfaces the linked-account state in Settings.

## Tasks

- [086 — Follows list (artists / labels / playlists)](../../tasks/086-mobile-follows-list)
- [087 — Ignores list (artists / labels / releases)](../../tasks/087-mobile-ignores-list)
- [088 — Follow sheet from row long-press](../../tasks/088-mobile-follow-sheet)
- [089 — Spotify integration auth](../../tasks/089-mobile-spotify-integration)

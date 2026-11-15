# Proposal

## Why

On the Notifications page's Samples tab, picking a sample changes the matches
and Sounds like tables further down the page, which is easy to miss, especially
on a phone. On a phone the rows are also small and the tables scroll sideways.
The tab's "Open in Discover" link reuses the `~` search operator, which
elsewhere means audio similarity (`track:~`, `cart:~`), for a list of
fingerprint matches. That list adds little: a sample rarely has many good
matches, and they are already listed in the tab.

## What Changes

- The Samples tab becomes an accordion. Each sample is a row with play, name,
  match count, delete and a chevron at the end, kept apart from delete by a
  divider. Opening a sample shows its content directly under its row and
  closes the one that was open.
- The open sample's header bar holds a Matches / Sounds like toggle in the
  existing tab-button style, so only one of the two lists shows at a time, on
  desktop and on mobile.
- On mobile, matches and similar tracks are two-line rows (title; artist ·
  label; time and tempo on the right) with no sideways scrolling.
- "Follow to catch it" suggestions use the Follow-popup button style, one
  button per artist or label, each on its own row, and leave out the artists
  and labels the user already follows. The server drops followed ones before
  picking the top five, so up to five useful suggestions remain.
- "Open in Discover" is removed from the Samples tab.
- **BREAKING**: the `sample:~<id>` search term and its match-score sort are
  removed from track search. A query containing it is treated as free text.
- Sample-match emails link to the Samples tab with that sample opened
  (`/notifications/samples?sample=<id>`) instead of the `sample:~<id>` search.
  The Samples tab opens the sample named in that link.

Nothing else on the Notifications page (tab bar, Activity, Subscriptions) or in
the player changes.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `notifications-page`: the Samples requirement changes to the accordion with
  a Matches / Sounds like toggle and per-sample delete; a link can open a given
  sample. Its base requirement is in the `notifications-page` change, which
  must be archived before this one.
- `sample-sounds-like`: follow suggestions leave out followed artists and
  labels before the top five are picked. Its base requirement is in the
  `notification-backend` change, which must be archived before this one.
- `suspected-sample-matches-display`: the `sample:~<id>` search term, its
  default sort and the old Settings link requirement are removed, and the
  sample-match email links to the Samples tab.

## Impact

- Front end: `packages/front/src/NotificationsPage.js` and
  `NotificationsPage.css` (Samples tab only). It reuses `SpinnerButton` /
  `FollowItem`-style buttons and the existing tab-button styles.
- Server: `packages/back/routes/shared/db/sample-similarity.js` (follow
  suggestions); `packages/back/routes/shared/db/search.js` (removes the
  `sample:~` term); `packages/back/jobs/sample-match-notifications.js` (email
  link).
- Tests: the sample-similarity and sample-match-notification tests are
  updated; `test/tests/users/tracks/search-sample-token.js` is removed. The
  notifications-page browser demo tests (`notifications-page-local.js` /
  `-preview.js`) gain the redesigned Samples tab.
- Links in emails sent before the change still point at `sample:~<id>`. They
  open a search with no useful results instead of the match list.

# Notifications page — design

Change 3 of 3 for the notifications / sample-playback redesign (canvas "Sample
Match Playback", https://claude.ai/artifact/5srUyRFRmXn44kcCiZBUqA, both
pages). Builds on `notification-backend` (events, matches, Sounds like API) and
`one-player` (source-following player, docked player).

## Goal

Everything the user *listens to* moves to a top-level Notifications page beside
Discover and Carts; Settings keeps only what they *configure*:

- Top bar: Notifications link with a bell and unread count.
- `/notifications/activity`: one feed of sample matches and new tracks from
  searches, artists and labels, newest first, playable like any list.
- `/notifications/samples`: upload / delete samples, a sample's matches with
  where and how fast they matched, aligned A/B between the sample and a match,
  loop-match, and "Sounds like" with artists/labels to follow.
- `/notifications/subscriptions`: searches, artists and labels the user is
  notified about, each with its bell, plus adding a search.
- Settings › Notifications becomes Settings › Email (address only).
- A notify bell on each followed artist / label in Settings › Following.

## Layout and playback

- On `/notifications/*` the full Preview panel stays on top (the one player);
  the Player renders in a `panelOnly` mode — Preview without its track list —
  and the Notifications page renders below it. Settings keeps the docked bar.
- Playing a row makes that tab the source: `Notifications · Activity`,
  `Samples · <filename>` (matches), `Sounds like · <filename>`. Activity,
  matches and similar lists are not on-screen lists for the queue, so next /
  previous use the snapshot taken when the row was played.
- The samples source path changes to `/notifications/samples`.

## Bell and unread

- App polls `GET /me/notifications/events/unread-count` every 60 s while the
  tab is visible, on focus, and after playing a track (hearing marks read).
- The top-bar link shows a bell and a magenta count badge when unread > 0.
- Activity rows show a "New" dot while unread; "Mark all read" posts
  `{ all: true }`.
- No dropdown: the bell links to Activity (the canvas's dropdown is a later
  enhancement).

## Samples tab

- Samples table: play (through the player), name, added, matches, delete;
  upload button (same API as today). Selecting a row selects the sample.
- Matches table for the selected sample (`GET …/:id/matches`): New dot, artist,
  title, label, matched at (`preview start + offset`, m:ss), tempo
  (`(tempoFactor − 1) · 100` as ±x.x %), score. Playing a row plays the match
  as an A/B pair.
- Sounds like (`GET …/:id/similar`): artist, title, label, similarity %; and
  "Follow to catch it": up to 5 artists/labels with Follow buttons (existing
  follow endpoints by store URL / id). Empty / pending states as on the canvas.

### Aligned A/B and loop-match

A match row is played as a track with an `abPair`:
`{ sampleUrl, sampleTitle, offsetSeconds, tempoFactor, sampleDurationSeconds }`.
The matcher's model is `preview_time = offset + tempoFactor · sample_time`, so:

- A → B at sample time `t`: play the preview from `offset + tempoFactor · t`.
- B → A at preview time `p`: play the sample from `(p − offset) / tempoFactor`
  (clamped to the sample).
- Loop match (on by default for a pair): while B plays, wrap from
  `offset + tempoFactor · duration` back to `offset`.
- Without offset/tempo (not yet rescored) B starts from the preview start and
  loop is unavailable.

Preview implements this with an `abSource` state (`'A' | 'B'`), a pending seek
applied once the new source can play, and the loop check in `onTimeUpdate`.
The A/B segmented control and Loop toggle appear in the Preview panel only for
A/B pairs; the "Matched at / Tempo" details replace Labels / Released.

## Subscriptions tab

Three groups from `props.notifications`: Searches (text without an entity
prefix), Artists (`artist:<id>`), Labels (`label:<id>`), each item with its
display name, a link to its search and a bell button that removes the
subscription for all its stores. A text input adds a search subscription for
the enabled stores. The `queryNotifications` display-name regexes are fixed
(`\d` was lost in the JS template literal, so artist/label subscriptions showed
their raw text).

## Settings

- Tab "Notifications" → "Email" (`/settings/email`); `/settings/notifications`
  redirects there. It keeps the email address and verification and links to the
  Notifications page for subscriptions and samples.
- Following: each followed artist / label gets a bell toggling the
  `artist:<id>` / `label:<id>` subscription for that store.

## Testing

- Jest: A/B time mapping and loop bounds (`abTiming.js`), subscription
  grouping, formatting of matched-at / tempo.
- Back end: regression test for subscription display names.
- Demo tests (shared steps `test/lib/notifications-page-steps.js`):
  - `notifications-page-preview.js` — seeds via the API only: follows an
    artist and adds a search subscription, then shows the bell in the top bar,
    Activity (empty state), Subscriptions (the search with its bell, adding and
    removing one), the bell on Following toggling the artist subscription, and
    Settings › Email.
  - `notifications-page-local.js` — the same steps, plus DB-seeded events and a
    sample match with offset/tempo (events can only come from the jobs, which
    the preview cannot trigger): the unread count, playing an Activity row
    clears its New dot and lowers the count, and the Samples tab plays a match
    with A/B switching to the aligned position.

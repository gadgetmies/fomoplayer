## Why

Notifications today are only email: Settings › Notifications mixes the email
address with things the user listens to (search subscriptions, audio samples),
nothing in the app shows that something new arrived, and sample matches open as
a plain search. The redesign (canvas "Sample Match Playback") gives them a
top-level page with an unread bell and plays sample matches aligned with the
sample. Design: `docs/superpowers/specs/2026-10-19-notifications-page-design.md`.

## What Changes

- Top bar: Notifications link with bell and unread count.
- New `/notifications/{activity,samples,subscriptions}` page under the one
  player's Preview panel.
- Samples tab: samples, matches with matched-at and tempo, aligned A/B and
  loop-match in the player, Sounds like with follow suggestions.
- Subscriptions tab with notify bells; fixed subscription display names.
- Settings › Notifications renamed Email (address only); bells on Following.

## Capabilities

### New Capabilities
- `notifications-page`: the bell, the Notifications page tabs, Settings ›
  Email and the Following bells.
- `sample-ab-playback`: playing a sample match as an aligned A/B pair with
  loop-match.

### Modified Capabilities

(none)

## Impact

- `packages/front/src/`: `App.js`, `TopBar.js`, `Player.js`, `Preview.js`,
  `Settings.js`, `FollowedItem.js`, new `Notifications*.js`, `abTiming.js`.
- `packages/back/routes/users/db.js` (`queryNotifications` regex fix) + test.
- Demo tests `notifications-page-local.js` / `-preview.js`.

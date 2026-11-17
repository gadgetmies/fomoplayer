## Why

In the top bar and in Notifications › Subscriptions, typing `artist:` or
`label:` looks the name up and lists matches. Pressing space ends the term:
`label:Vision Recordings` turns into a `label:Vision` pill (resolved to the
first match) followed by a text pill, and quotes (`label:"Vision Recordings"`)
are sent to the lookup as part of the name. Names of more than one word cannot
be looked up.

In Notifications › Subscriptions, picking a match subscribes to it straight
away, so a search that combines several artists, or an artist and a label,
cannot be built. The subscription list and the notification emails also only
name a subscription when it is a single `artist:<id>` or `label:<id>`; a
combined text like `artist:12 label:34` is shown raw (and the email job
mis-reads it as one entity).

## What Changes

- While an entity lookup is active (`artist:`, `label:`, `release:`,
  `track:` followed by a name that is not an id), space is part of the name
  and keeps the lookup open. Quotes around the name are accepted and are not
  sent to the lookup; a quoted number is a name, not an id.
- Every pill search bar (not only Notifications › Subscriptions) shows the
  "Searching…" / "No artists match" popup for an active lookup and preselects
  the first match.
- Picking a match in Notifications › Subscriptions adds it as a pill, like in
  the top bar. The search is added with Enter (in an empty field) or Add, so
  pills can be combined.
- Subscriptions and notification events name every `artist:<id>` /
  `label:<id>` term of a combined text, and the notification email does the
  same.

- The top bar's "Subscription unavailable" warning opens a popup on hover
  (desktop) or tap (mobile) explaining that subscribing needs a verified
  email and linking to Settings › Email. Its hand-built popup never opened
  (it lacked the classes the popup CSS needs) and linked to Settings ›
  Following.

## Capabilities

### New Capabilities
- `search-entity-terms`: typing entity terms in the pill search bars.

### Modified Capabilities
- `notifications-page`: adding a search subscription builds it from pills;
  the top bar explains why subscribing is unavailable.

## Impact

- `packages/front/src/GlobalSearchBar.js`, `searchTerms.js`,
  `NotificationsPage.js`.
- `packages/back/routes/users/db.js`, `routes/shared/db/notification-events.js`,
  `jobs/notifications.js`, and a new `routes/shared/subscription-names.js`.
- `packages/front/src/TopBar.js` / `TopBar.css` for the warning popup.
- Demo tests `subscription-unavailable-local.js` / `-preview.js`.
- Demo tests `entity-search-terms-local.js` / `entity-search-terms-preview.js`;
  the notifications demo's subscribe step now adds the picked artist with Enter.

# Story 048 — Push notifications

Register the device with APNs / FCM, store push tokens server-side,
extend the existing notifications model to dispatch native push, and
deep-link from a tapped notification into the relevant search / track.

## User-facing change

A user grants notification permission (with a clear opt-in screen
explaining what they'll get), and from then on receives a native push
when a new track matches a saved search. Tapping the notification
opens the app at that search's results.

## Why

Push notifications are the highest-value thing a native app does over
the web. The current notifications system already groups by saved
search and dispatches via email / web push — adding native push is
an incremental backend change plus the mobile registration plumbing.

## "Done" looks like

- Backend stores per-user push tokens and dispatches notifications via
  APNs / FCM (Expo push or direct provider — decide in the bootstrap
  task).
- Mobile shows a clear opt-in screen at first launch, with a
  Settings → Notifications toggle to revisit later.
- Tapping a push notification deep-links into the search/track that
  triggered it.
- Per-saved-search subscribe / unsubscribe is reflected on the mobile
  Settings → Notifications screen and from the Search tab's
  subscribe shortcut (story 044).

## Tasks

- [096 — Backend: push tokens + APNs/FCM dispatch](../../tasks/096-backend-push-tokens-and-dispatch)
- [097 — Mobile: register + opt-in screen](../../tasks/097-mobile-push-registration-and-optin)
- [098 — Notification deep-link handler](../../tasks/098-mobile-notification-deep-link)
- [099 — Per-search subscribe/unsubscribe UI](../../tasks/099-mobile-per-search-push-toggle)

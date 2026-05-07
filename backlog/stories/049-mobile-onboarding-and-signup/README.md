# Story 049 — Onboarding & sign-up

First-run experience: sign-up availability check, waiting-list
fallback, email verification, and a brief onboarding tour adapted for
touch (gestures + lock-screen controls instead of keyboard
shortcuts).

## User-facing change

A new user opens the app, picks "Sign up" from the login screen,
either creates an account (if sign-up is open) or joins the waiting
list (if not). After verifying their email they're walked through a
2–3 step onboarding tour: how to swipe rows, how to play a track and
control it from the lock screen, and how to follow an artist /
subscribe to a search. Existing users skip the tour.

## Why

The web onboarding is keyboard-shortcut heavy and not relevant on
mobile. Touch users need a different first-five-minutes story —
gestures, lock-screen controls, and the search-subscribe loop — to
internalise the mobile-specific affordances.

## "Done" looks like

- Sign-up screen consults `/sign-up-available`; if closed, surfaces
  the waiting-list form (`POST /join-waiting-list`).
- Email verification deep link opens a confirmation screen
  (overlaps with story 041 — coordinate; this story owns the UX, story
  041 owns the routing wiring).
- Onboarding tour shown to first-launch users — skippable, dismissable
  permanently from Settings.
- Tour content covers swipe-to-cart, swipe-to-heard, lock-screen
  controls, and search-subscribe.

## Tasks

- [100 — Sign-up + waiting-list screen](../../tasks/100-mobile-signup-and-waiting-list)
- [101 — Email verification result screen](../../tasks/101-mobile-email-verification-screen)
- [102 — Onboarding tour (gestures + lock-screen + search-subscribe)](../../tasks/102-mobile-onboarding-tour)

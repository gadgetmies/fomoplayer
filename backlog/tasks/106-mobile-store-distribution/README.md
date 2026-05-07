---
id: 106
title: TestFlight / Play Internal pipelines + store metadata
effort: L
created: 2026-05-07
---

# TestFlight / Play Internal pipelines + store metadata

## Why

The apps don't reach users until they're on the stores. The
distribution pipeline is the work that makes "we have a build"
into "users can install it".

## What

- EAS Submit pipelines for TestFlight and Play Internal Testing.
- Signing keys + provisioning profiles for iOS; signing keystore
  for Android. Stored as EAS secrets, not in the repo.
- App Store Connect listing: app name, subtitle, description,
  keywords, screenshots (every required size), preview video
  optional.
- Play Console listing: same, plus content rating, data-safety
  form.
- Privacy nutrition labels (iOS) and data-safety section
  (Android) declare what the app collects, matching the
  telemetry decisions in task 105.
- Internal-testing release notes per build.

## Acceptance criteria

- [ ] Internal testers can install on iOS via TestFlight on every
      `master` merge that touches mobile.
- [ ] Same on Android via Play Internal Testing.
- [ ] Store listings pass App Store Connect / Play Console
      submission validation.
- [ ] Public store-listing assets (screenshots, copy) live in the
      repo or a clearly-referenced shared drive.

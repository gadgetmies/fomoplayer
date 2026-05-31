# Manual test checklist — Settings audio-sample link

Jest + React Testing Library is not configured for `Settings.js` (the
front-end only has `react-scripts test` with basic ReactDOM-render
smoke tests; no `@testing-library/react` package). Per task 4.5, this
checklist substitutes for an automated unit test. Copy it into the PR
description.

Setup:

- Apply the migration on the local DB.
- Start the backend and frontend.
- Log in as a user that has uploaded one or more audio samples (the
  Settings → Notifications → Audio samples list must render at least
  one row).

## Render states

- [ ] **matchCount = undefined (in-flight)** — refresh Settings; while
      the audio-samples request is in flight, no "suspected matches"
      link appears (no "0 → N" flash).
- [ ] **matchCount = 0** — with the `user_notification_audio_sample_match`
      table empty for the sample, the audio-sample row shows filename,
      file-size, and delete button only. No middot, no link.
- [ ] **matchCount = 1** — `INSERT` exactly one match row for the
      sample; refresh Settings. The row reads
      `filename (TYPE, X.XX MB) · 1 suspected match ×`.
- [ ] **matchCount = N (N > 1)** — `INSERT` 7 match rows for the
      sample. The row reads `... · 7 suspected matches ×`.

## Click behaviour

- [ ] Clicking the link navigates to `/search/?q=sample:~<sample-id>`
      via the existing NavLink router. The browser URL bar reflects
      this.
- [ ] The click does NOT trigger any row-level handler (e.g. the
      play/pause that wraps the file-name area). Verify by clicking
      the link while audio is paused — audio does not start playing.
- [ ] The search results page renders tracks ordered by descending
      `MAX(user_notification_audio_sample_match_score)`.

## Visual spec

- [ ] Link uses inherited body colour (no `<a>` browser-default blue).
- [ ] Link sits at `font-size: 85%`, matching the file-size text.
- [ ] Middot separator is at `opacity: 0.4`.
- [ ] Hover / focus underlines the link only — no row-level
      highlight.
- [ ] Tab-focus shows an outline ring on the link's bounding box, not
      on the surrounding `<li>` or `.pill-button`.

## Cross-user safety

- [ ] In an incognito session as a different user, navigate to
      `/me/tracks?q=sample:~<other-user's-sample-id>`. Response is
      200 with an empty result set (not 403, no track data).

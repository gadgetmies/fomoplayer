# Proposal

## Why

Issue #411 asks for a typo fix in the README. The top-level `README.md` has no misspelled words, but it has three visible slips: the heading ends with a full stop, the description sentence after it lacks one, and the screenshot's alternative text (read by screen readers) is the placeholder "image".

## What Changes

- Drop the trailing full stop from the heading: `# Fomo Player - A Music Discovery App.` becomes `# Fomo Player - A Music Discovery App`.
- Add the missing full stop to the end of the description sentence ending "...on Bandcamp, Beatport and Spotify".
- Replace the screenshot's `alt="image"` with `alt="Fomo Player track list"`.
- No other files, package READMEs, code, tests or user interface change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is a documentation-only change with no spec-level behaviour, so the change sets `skip_specs: true`.

## Impact

- `README.md` only (three lines).
- No code, API, dependency or runtime impact.

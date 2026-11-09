# Proposal

## Why

Issue #417 points out that the getting-started sentence in the top-level `README.md`, `To get started, please [visit the wiki](...)`, ends without a full stop. Every other sentence in the README ends with one.

## What Changes

- Add a full stop straight after the closing bracket of the wiki link, so the line ends `...wiki/Getting-started).`
- The link text and the link address stay the same; the full stop sits outside the link.
- No other wording, files, code, tests or user interface change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is a documentation-only change with no spec-level behaviour, so the change sets `skip_specs: true`.

## Impact

- `README.md` only (one line).
- No code, API, dependency or runtime impact.

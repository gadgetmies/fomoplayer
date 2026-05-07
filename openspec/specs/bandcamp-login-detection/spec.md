# Bandcamp login detection

## Purpose

How the Fomo Player browser extension determines whether a Bandcamp tab
is logged in for the purpose of gating sync controls in the popup.

## Requirements

### Requirement: Login probe relies on the menubar Log-in link

The Bandcamp content script's `bandcamp:probe` handler SHALL determine
the `loggedIn` flag by querying the document for a menubar Log-in
anchor (`a[href*="/login?from=menubar"]`). The user MUST be reported
as logged in iff that anchor is absent. The probe MUST NOT depend on
`.userpic`, `#pagedata`'s `data-blob`, or any cookie-level check.
Detection MUST be reliable on every Bandcamp page surface (homepage,
release page, artist subdomain, fan dashboard, discover, feed).

#### Scenario: Bandcamp homepage — logged in

- **WHEN** the user is signed in to Bandcamp and the active tab is
  the bandcamp.com homepage
- **THEN** the document contains no `a[href*="/login?from=menubar"]`
  anchor and the `bandcamp:probe` handler returns `loggedIn: true`.

#### Scenario: Release page — logged in

- **WHEN** the user is signed in and the active tab is a Bandcamp
  release / track / artist page (on either bandcamp.com or an artist
  subdomain) whose hydrated menubar exposes no Log-in anchor
- **THEN** the handler returns `loggedIn: true`.

#### Scenario: Logged-out tab — every Bandcamp surface

- **WHEN** the active tab's hydrated menubar exposes an
  `a[href*="/login?from=menubar"]` anchor
- **THEN** the handler returns `loggedIn: false`.

### Requirement: `bandcamp:probe` response shape is preserved

The `bandcamp:probe` content-script handler SHALL continue to return
an object of the form `{ loggedIn, hasPlayables, onSubdomain }` so
the popup's `BandcampPanel` does not need a contract change. Any
caller that already reads these three booleans MUST keep working
without modification.

#### Scenario: Probe response carries the existing three flags

- **WHEN** the popup sends `{ type: 'bandcamp:probe' }` to the active
  Bandcamp tab
- **THEN** the response is an object whose own enumerable keys are
  exactly `loggedIn`, `hasPlayables`, and `onSubdomain`, each a
  boolean.

### Requirement: Popup gating reflects the per-tab probe on every open

`BandcampPanel` SHALL re-issue the `bandcamp:probe` message when the
popup mounts, so the sync controls' `disabled` state reflects the
active tab's current login state and is not cached across popup
opens.

#### Scenario: Re-open after logging in

- **WHEN** the user opens the popup on a Bandcamp tab while logged
  out (sync buttons disabled), then logs in on that tab and re-opens
  the popup
- **THEN** the second open re-runs the probe, the response reports
  `loggedIn: true`, and the wishlist-sync and feed-sync buttons are
  enabled without any further user action.

#### Scenario: Re-open after logging out

- **WHEN** the user opens the popup on a Bandcamp tab while logged
  in (sync buttons enabled), then logs out on that tab and re-opens
  the popup
- **THEN** the second open re-runs the probe, the response reports
  `loggedIn: false`, and the sync buttons are disabled.

### Requirement: Sync heading drops the "Requires login" hint when logged in

The popup's Bandcamp Sync section heading SHALL render the
parenthetical "(Requires login)" only while the active tab is
detected as logged out. When `loggedIn` is true the heading MUST read
"Sync" with no parenthetical, so the hint and the buttons' enabled
state never disagree.

#### Scenario: Logged-in tab — heading reads "Sync"

- **WHEN** the popup is opened on a logged-in Bandcamp tab
- **THEN** the Sync section heading text is exactly "Sync".

#### Scenario: Logged-out tab — heading reads "Sync (Requires login)"

- **WHEN** the popup is opened on a logged-out Bandcamp tab
- **THEN** the Sync section heading text is exactly "Sync (Requires
  login)".

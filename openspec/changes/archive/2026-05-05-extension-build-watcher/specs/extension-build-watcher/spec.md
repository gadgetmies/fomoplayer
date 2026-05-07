## ADDED Requirements

### Requirement: `yarn watch` rebuilds on save into the same per-browser build directory

The browser-extension package SHALL expose a `yarn watch` script that
runs webpack in long-running watch mode against one or more selected
browser targets. Each rebuild MUST land in the same
`build/<browser>/` directory the production build writes to, so the
operator can keep an unpacked extension loaded and just reload it
after each save.

#### Scenario: Save triggers a rebuild that overwrites build/chrome

- **WHEN** the operator runs `yarn watch` and edits a source file
  (e.g. `src/js/popup/Root.jsx`)
- **THEN** webpack rebuilds and the rebuild writes to
  `build/chrome/`, replacing the prior bundle without touching any
  other browser's build directory.

### Requirement: Browser selection via `BROWSERS` env var

The watch script SHALL read a `BROWSERS` environment variable
expecting a comma-separated list of browser targets. The default,
when `BROWSERS` is unset or empty, MUST be `chrome`. Each entry MUST
be one of `chrome` or `firefox`. Whitespace around entries MUST be
trimmed; empty entries (e.g. trailing commas) MUST be filtered. Any
entry outside the supported set, including `safari`, MUST cause the
script to exit with a non-zero code and a single-line error naming
the supported set.

#### Scenario: Default target

- **WHEN** the operator runs `yarn watch` with no `BROWSERS` env
- **THEN** the script watches and rebuilds the `chrome` target only.

#### Scenario: Multi-target watch

- **WHEN** the operator runs `BROWSERS=chrome,firefox yarn watch`
- **THEN** the script watches both `chrome` and `firefox` targets,
  rebuilding both on every source change.

#### Scenario: Safari rejected at startup

- **WHEN** the operator runs `BROWSERS=safari yarn watch`
- **THEN** the script exits with a non-zero status and prints a
  single-line error explaining that Safari cannot be driven by a
  Node watcher (Xcode rebuild + re-sign + re-install required).

#### Scenario: Unknown target rejected at startup

- **WHEN** the operator runs `BROWSERS=opera yarn watch`
- **THEN** the script exits with a non-zero status and an error
  naming the supported set (`chrome`, `firefox`).

### Requirement: Each rebuild's log output is tagged with the browser target

When the watch script rebuilds, the log output for each per-target
rebuild SHALL be prefixed with the browser name (e.g.
`[chrome] compiled successfully (1234ms)`). When more than one
target is being watched, the prefix MUST disambiguate which output
belongs to which target. Errors and warnings MUST also be prefixed
so the operator does not have to guess which build broke.

#### Scenario: Single-target rebuild log

- **WHEN** the watcher rebuilds the `chrome` target after a save
- **THEN** the rebuild summary line begins with `[chrome] `.

#### Scenario: Multi-target rebuild log

- **WHEN** the watcher rebuilds both `chrome` and `firefox` after a
  save
- **THEN** each target's summary line begins with its own
  `[<browser>] ` prefix; lines are not interleaved within a single
  target's output (each target's stats print as a contiguous block).

#### Scenario: Error output is tagged

- **WHEN** a rebuild fails on the `firefox` target
- **THEN** the error message lines are prefixed with `[firefox] `
  so the operator can tell which target needs fixing.

### Requirement: Watch script handles SIGINT cleanly

The watch script SHALL respond to `SIGINT` (Ctrl-C) and `SIGTERM` by
closing the underlying webpack watcher and exiting with status 0.
Pending in-flight builds MUST not leave the operator's terminal in a
half-broken state.

#### Scenario: Ctrl-C stops the watcher

- **WHEN** the operator presses Ctrl-C while `yarn watch` is running
- **THEN** the script logs that it is shutting down, calls the
  watcher's `close` method, and exits with status 0.

### Requirement: Existing build / start flows are not regressed

The new watch script MUST NOT modify `webpack.config.js`,
`utils/build.js`, or `utils/webserver.js` in ways that change their
behaviour. The existing `yarn build` / `yarn build:chrome` /
`yarn build:firefox` / `yarn build:safari` and `yarn start`
commands MUST continue to work as documented.

#### Scenario: Production build path unchanged

- **WHEN** the operator runs `yarn build:chrome` after the watch
  script lands
- **THEN** the resulting `build/chrome/` directory matches the
  pre-change behaviour (production mode, no devtool, same bundle
  set).

### Requirement: Safari is documented as out of scope in the README

The browser-extension `README.md` SHALL include a "Watch mode"
subsection that names `yarn watch` and the per-target convenience
scripts, calls out the `BROWSERS` env-var contract, and explicitly
notes that Safari is not supported in watch mode (with a one-line
reason and a pointer at the existing distribution flow). The
documentation MUST also state that the watcher does not auto-reload
the extension in the browser — the operator still triggers a manual
reload from the extensions page after each rebuild.

#### Scenario: Watch mode subsection is present

- **WHEN** a contributor opens
  `packages/browser-extension/README.md`
- **THEN** a "Watch mode" subsection lists the `yarn watch` /
  `yarn watch:chrome` / `yarn watch:firefox` / `yarn watch:all`
  scripts, explains the `BROWSERS` env contract, mentions that
  Safari is excluded, and notes that the operator reloads the
  extension manually after a rebuild.

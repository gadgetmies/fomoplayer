## ADDED Requirements

### Requirement: Unified Sentry project for all runtime surfaces

All four runtime packages — `packages/back`, `packages/front`,
`packages/browser-extension`, and `packages/cli` — SHALL report errors to
the same hosted Sentry project so that issues group across surfaces and a
single Sentry webhook covers every source.

Each package SHALL initialise its Sentry SDK at process / page / service-worker
start, before any code that could throw, and SHALL tag events with a
`runtime` tag identifying the package (`back`, `front`, `extension`, `cli`).

#### Scenario: Backend reports an unhandled error

- **WHEN** an Express handler in `packages/back` throws an unhandled error
- **THEN** the Sentry SDK captures it and the resulting event in Sentry is
  tagged `runtime: back` and carries the backend `release` value

#### Scenario: Front-end reports an unhandled error

- **WHEN** a React render throws an unhandled error in `packages/front`
- **THEN** the Sentry browser SDK captures it and the resulting event in
  Sentry is tagged `runtime: front` and carries the front-end `release`
  value

#### Scenario: Browser extension reports an unhandled error

- **WHEN** the service worker or a content script in
  `packages/browser-extension` throws an unhandled error
- **THEN** the Sentry SDK captures it and the resulting event in Sentry is
  tagged `runtime: extension` and carries the extension `release` value

#### Scenario: CLI reports an unhandled error

- **WHEN** the CLI in `packages/cli` throws an unhandled error
- **THEN** the Sentry Node SDK captures it and the resulting event in
  Sentry is tagged `runtime: cli` and carries the CLI `release` value

### Requirement: DSNs and release tags from configuration

Sentry DSNs and `release` values SHALL NOT be hard-coded in source. Each
package SHALL read its DSN from configuration:

- `packages/back` and `packages/cli` SHALL read `SENTRY_DSN` (and an
  optional `SENTRY_ENVIRONMENT`) via `fomoplayer_shared/config` / process
  environment.
- `packages/front` and `packages/browser-extension` SHALL receive their DSN
  via build-time injection (`EnvironmentPlugin` / `DefinePlugin`) from
  build-time env vars, following the project's existing no-hardcoded-URLs
  policy.

`release` SHALL be derived per package:

- Backend / front-end / CLI: from the package version or git short SHA at
  build time.
- Extension: from the version field in `manifest.json` at build time.

#### Scenario: Backend DSN missing in local development

- **WHEN** `SENTRY_DSN` is not set in the environment
- **THEN** the backend Sentry SDK initialises in disabled mode (no events
  sent) and process startup completes successfully

#### Scenario: Extension build without DSN

- **WHEN** the browser-extension build runs without a Sentry DSN configured
- **THEN** the extension bundles with Sentry initialised in disabled mode
  and no DSN string is emitted into the bundle

### Requirement: Front-end source maps uploaded to Sentry

The `packages/front` build SHALL upload source maps to Sentry at build time
(using Sentry CLI or the bundler plugin), associated with the same
`release` tag emitted by the runtime SDK, so production stack traces in
Sentry resolve to original source positions.

#### Scenario: Production build uploads source maps

- **WHEN** the front-end production build completes
- **THEN** source maps for that build are uploaded to Sentry and attached
  to the release matching the bundle's runtime `release` tag

#### Scenario: Stack trace in Sentry resolves to original source

- **WHEN** a production front-end error appears in Sentry
- **THEN** its stack trace shows original file paths and line numbers from
  the uploaded source maps, not the minified bundle positions

### Requirement: Errors-only instrumentation

Sentry SDK initialisation in v1 SHALL capture errors only. Performance
monitoring, profiling, session replay, and tracing SHALL NOT be enabled in
any of the four packages.

#### Scenario: No performance events emitted

- **WHEN** any of the four packages runs in production
- **THEN** Sentry receives only error / message events for that package
  and no `transaction`, `profile`, or `replay` events

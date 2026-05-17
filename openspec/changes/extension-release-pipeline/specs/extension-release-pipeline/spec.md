## ADDED Requirements

### Requirement: Workflow SHALL trigger on release tag pushes and manual dispatch

The repository SHALL include a GitHub Actions workflow that runs when a Git tag matching `v*` is pushed and when a maintainer invokes `workflow_dispatch`. No other trigger (PR, push to branch, schedule) SHALL invoke this workflow.

#### Scenario: Tag push starts the workflow
- **WHEN** a maintainer pushes a tag matching `v*` (e.g. `v1.2.3`) to the repository
- **THEN** the extension-release workflow starts automatically against the tagged commit

#### Scenario: Manual dispatch starts the workflow
- **WHEN** a maintainer invokes the workflow via the Actions UI or `gh workflow run`
- **THEN** the extension-release workflow starts against the selected ref
- **AND** no Git tag is required for it to run

#### Scenario: Pull request does not start the workflow
- **WHEN** a pull request is opened or updated
- **THEN** the extension-release workflow MUST NOT run

### Requirement: Workflow SHALL build all three browser extensions on a single Linux runner

The workflow SHALL run a single build job on `ubuntu-latest` that installs Node 22 + yarn, runs `yarn install --frozen-lockfile`, and invokes `yarn build:chrome`, `yarn build:firefox`, and `yarn build:safari` against the `packages/browser-extension` workspace. All three targets share toolchain (Node + webpack) and SHALL be built in the same job to avoid duplicate dependency installs. The workflow SHALL NOT use a macOS runner — Safari is shipped as a source bundle (see next requirement) rather than as a pre-built `.app`.

#### Scenario: Linux job produces all three browser builds
- **WHEN** the workflow runs to completion on `ubuntu-latest`
- **THEN** `packages/browser-extension/build/chrome/`, `packages/browser-extension/build/firefox/`, and `packages/browser-extension/build/safari/` all exist with the compiled extension bundles

#### Scenario: Firefox build passes web-ext lint
- **WHEN** the Firefox build completes
- **THEN** `yarn lint:firefox` runs against `build/firefox/` and the workflow fails if it reports errors

### Requirement: Safari archive SHALL be a source bundle, not a built .app

The Safari Release asset SHALL be a zip containing the committed `Fomo Player/` Xcode project tree, the `build/safari/` webpack output (positioned at the relative path the project's file references expect — `build/safari/` two directories up from `Fomo Player.xcodeproj`), and a `README.md` documenting how a recipient builds and installs the extension via Xcode + their own Apple ID. The workflow SHALL NOT run `xcodebuild`, SHALL NOT sign or notarize anything, and SHALL NOT require any Apple Developer credentials.

#### Scenario: Safari zip contains source bundle, not a .app
- **WHEN** the workflow packages the Safari archive
- **THEN** the zip contains a top-level directory `fomo-player-safari-source-<version>/` with `Fomo Player/`, `build/safari/`, and `README.md` inside it
- **AND** the zip does NOT contain a `.app` bundle

#### Scenario: Bundled README documents the Xcode build flow
- **WHEN** a recipient extracts the Safari zip
- **THEN** the included `README.md` documents the prerequisites (Mac, Xcode, free Apple ID), the per-target Signing & Capabilities setup, the ⌘R build step, the Safari Settings → Extensions enablement step, and the 7-day Personal Team signature expiry caveat

#### Scenario: Workflow uses no Apple-specific tooling
- **WHEN** the workflow runs
- **THEN** no step invokes `xcodebuild`, `codesign`, `notarytool`, `xcrun safari-web-extension-converter`, or any other Apple toolchain
- **AND** no Apple Developer secret (`p12`, App Store Connect API key, etc.) is referenced

### Requirement: Build outputs SHALL be packaged with version-stamped archive names

Each artifact SHALL produce a zip archive whose filename includes the release version. For tag-triggered runs the version SHALL be derived from the Git tag (`v1.2.3` → `1.2.3`); for manual dispatch the version SHALL default to the short commit SHA. The expected archive names are `fomo-player-extension-chrome-<version>.zip`, `fomo-player-extension-firefox-<version>.zip`, and `fomo-player-extension-safari-source-<version>.zip`.

#### Scenario: Tag-derived versioning
- **WHEN** the workflow runs against a tag `v1.2.3`
- **THEN** archives are named `fomo-player-extension-chrome-1.2.3.zip`, `fomo-player-extension-firefox-1.2.3.zip`, and `fomo-player-extension-safari-source-1.2.3.zip`

#### Scenario: Dispatch-derived versioning
- **WHEN** the workflow runs via `workflow_dispatch` with no tag
- **THEN** archives are named with the short commit SHA in place of the version

### Requirement: Workflow SHALL inject FRONTEND_URL from repository configuration

Every build step that invokes a `yarn build:*` script SHALL set `FRONTEND_URL` from the repository variable `FRONTEND_URL_PROD`. The workflow SHALL NOT contain a hard-coded fallback deployment URL — if `FRONTEND_URL_PROD` is unset the build SHALL fail fast, preserving the existing build-time guardrail.

#### Scenario: FRONTEND_URL is read from repository variable
- **WHEN** any `yarn build:chrome|firefox|safari` step runs
- **THEN** its environment contains `FRONTEND_URL=${{ vars.FRONTEND_URL_PROD }}`

#### Scenario: Missing FRONTEND_URL fails the build
- **WHEN** `FRONTEND_URL_PROD` is unset in repository variables
- **THEN** the `yarn build:*` step exits non-zero and the workflow fails before producing artifacts

### Requirement: Tag-triggered runs SHALL attach archives to a GitHub Release

When the workflow is triggered by a `v*` tag push, after both build jobs succeed it SHALL create (or update) the GitHub Release matching that tag and attach the three archives as Release assets. When triggered via `workflow_dispatch`, the workflow SHALL upload the archives as workflow artifacts only and SHALL NOT create a Release.

#### Scenario: Tag push attaches all three archives to the Release
- **WHEN** the workflow runs to completion on a `v*` tag push
- **THEN** the GitHub Release for that tag has the Chrome, Firefox, and Safari archives attached as Release assets

#### Scenario: Manual dispatch publishes workflow artifacts only
- **WHEN** the workflow runs via `workflow_dispatch`
- **THEN** the archives are available as workflow artifacts on the run page
- **AND** no GitHub Release is created or modified

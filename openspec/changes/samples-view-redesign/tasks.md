# Tasks

## 1. Follow suggestions leave out followed artists and labels

- [ ] 1.1 In `packages/back/routes/shared/db/sample-similarity.js`, make `tallyFollowSuggestions` drop followed artists and labels before sorting and taking five; verify with a new unit test (`packages/back/test/tests/...`) covering the "followed entries do not take a place" scenario and the artist-before-label tie, run by directory as `commit-and-test-discipline` lists.

## 2. Remove the `sample:~` search and relink the match email

- [ ] 2.1 Point the sample-match email link to `${frontendURL}/notifications/samples?sample=<id>` in `packages/back/jobs/sample-match-notifications.js`; verify by updating `test/tests/jobs/sample-match-notifications.js` to assert the new link (and no `sample%3A~`) and running it.
- [ ] 2.2 Remove the `sample:~` term, `sample_match_score` and the match-score sort from `packages/back/routes/shared/db/search.js`, and delete `test/tests/users/tracks/search-sample-token.js`; verify the remaining `test/tests/users/tracks` tests pass and a search for `sample:~7` returns the free-text result.
- [ ] 2.3 Remove the unused `.suspected-matches-link` rules from `packages/front/src/Settings.css`; verify with `git grep suspected-matches-link` returning nothing.

## 3. Samples tab accordion

- [ ] 3.1 Rebuild `renderSamples` in `NotificationsPage.js` as accordion rows (whole-row expand button, play, delete, divider, chevron) driven by `selectedSampleId`, with activating the open row closing it; verify in the browser steps of task 5.1 that opening B closes A and that play does not open a row.
- [ ] 3.2 Add the Matches / Sounds like toggle (`select-button` row) to the open sample's header bar, with `samplesView` state reset to Matches on open, inline on desktop and as a second header line at ≤ 768 px; verify in the browser steps that switching hides one list and shows the other.
- [ ] 3.3 Render matches and similar tracks as grid rows: header and columns above 768 px, two-line rows with no header at ≤ 768 px; remove "Open in Discover" and the "artists and labels behind them" wording; verify in the browser steps at 390 px that the page has no horizontal scroll.
- [ ] 3.4 Keep delete with its confirmation on every row, separate from the expand button; verify in the browser steps that a cancelled delete leaves the sample and its open state unchanged.

## 4. Follow buttons and deep link

- [ ] 4.1 Render "Follow to catch it" as `SpinnerButton size="large" icon="heart"` buttons, "Follow <name> · N similar tracks", one per row under Artists and Labels, removing a suggestion once followed; verify in the browser steps that following one removes its button.
- [ ] 4.2 Read `?sample=<id>` on the Samples tab, open that sample and scroll it into view, falling back to the default for unknown ids; verify in the browser steps by visiting `/notifications/samples?sample=<id>` and with an unknown id.

## 5. Demo recordings and verification

- [ ] 5.1 Add the Samples-tab steps to `packages/back/test/lib/notifications-page-steps.js` and a paired `test/browser/notifications-samples-local.js` / `-preview.js` (desktop and 390 px phone viewport) that share them. Preview seeds by uploading a sample through the UI; local may also seed matches through the database. Verify both run with `yarn ci:demo` locally.
- [ ] 5.2 Merge `master` into the branch, squash `wip:` commits into atomic commits, and run the full suite (`yarn test`, `yarn test:browser`); verify all green.

## Workflow follow-up

- Archive `notifications-page` and `notification-backend` before archiving this change.
- Open the pull request from the branch with the ` ```demo-test ` and ` ```demo-preview ` blocks naming the two new browser tests.

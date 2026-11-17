# Tasks

## 1. Radiator jobs run without manual enabling

- [ ] 1.1 In `packages/back/jobs/radiator/radiator.js`, register new radiator jobs as enabled with the `17 * * * *`
  schedule, keeping `ON CONFLICT DO NOTHING`. Verify with an API test (`test/tests/jobs/radiator.js`): a new job is
  enabled, and a job disabled beforehand stays disabled after registering again.
- [ ] 1.2 Add migration `…-enable-radiator-jobs` that enables the existing `*.sql` radiator jobs and sets their hourly
  schedule, with a down migration that restores the daily schedule. Verify with `yarn migrate` up and down on the
  test database.
- [ ] 1.3 In `updateJobs` (`packages/back/job-scheduling.js`), keep successful runs of radiator jobs for 31 days.
  Verify with a test in `test/tests/jobs/job-scheduling.js` that a 20-day-old radiator run survives cleanup and a
  20-day-old run of another job does not.

## 2. Preview analysis metrics

- [ ] 2.1 Load `jobs/radiator/metrics/*.js` metrics (`{ name, query }`) beside the SQL files, run through
  `runRadiatorQuery`. Verify with a test that a JavaScript metric is registered and its rows are stored.
- [ ] 2.2 Export `analysedCondition`, `PRODUCTION_EMBEDDING_TYPE`, `WAVEFORM_STORES` and `PREFETCH_STORES` from
  `routes/admin/preview-audio.js`. Add `preview-analysis.js` (per store: previews, missing, fingerprinted, embedded,
  with waveform). Verify with a test seeding previews in each state and asserting the per-store counts.
- [ ] 2.3 Add `preview-analysis-backlog.js`, reusing the prefetch conditions. It counts per store the previews still to
  analyse and how many of those are:
  - stored in the bucket;
  - missing a fingerprint, an embedding or a waveform;
  - without a release URL;
  - too large;
  - failing.

  Verify with a test covering each count.
- [ ] 2.4 Add `preview-audio-cache.js` (stored files, total size, oldest stored, failing, too large, the
  `PREVIEW_AUDIO_PREFETCH_MAX_STORED` cap). Verify with a test.
- [ ] 2.5 Run `EXPLAIN ANALYZE` on the three metric queries against a production-sized database copy and record the
  timings in this change's design notes. If one exceeds a few seconds, give it a 6-hour schedule in its migration.

## 3. Metric API

- [ ] 3.1 Add `GET /admin/radiator/metrics`, returning the name, columns and latest run (started, success, error) of
  every registered radiator metric. Verify with an API test that includes a failed metric and a non-admin request
  that is refused.
- [ ] 3.2 Add `GET /admin/radiator/metrics/:name?days=` returning `{ rows, truncated }`, flattened with `time`, newest
  first, `days` defaulting to 7 and limited to 30, rows limited to 50 000. Verify with API tests for flattening, the
  day limit and truncation.

## 4. Panel storage

- [ ] 4.1 Add a migration with `radiator_config_panel JSONB` and `radiator_config_position INTEGER`, making the lens and
  config columns nullable. Verify with migrate up and down.
- [ ] 4.2 Add `GET/POST /admin/radiator/panels` and `PUT/DELETE /admin/radiator/panels/:id`. Saving rejects a panel
  whose metric does not exist or whose `spec` is not an object. Verify with API tests for create, update, reorder,
  delete and rejection.

## 5. Front end: lazy admin and dependencies

- [ ] 5.1 Load the admin views with `React.lazy` and `Suspense` in `packages/front/src/App.js`. Verify that
  `yarn build` lists a separate admin chunk and that the main bundle shrinks.
- [ ] 5.2 Add `vega`, `vega-lite` and `vega-embed`, pinned to the exact versions already in use elsewhere or the
  current stable ones. Verify the admin chunk builds and the main bundle does not grow.

## 6. Front end: panel specification and form

- [ ] 6.1 Write `radiatorPanelSpec.js`, a pure function from form choices (chart type, x, y fields, series) to a
  Vega-Lite specification, covering the four chart types and multiple y fields. Verify with unit tests
  (`radiatorPanelSpec.test.js`) for each mapping.
- [ ] 6.2 Validate a specification typed as JSON (parse, then the Vega-Lite schema) and report the error without
  saving. Verify with unit tests for malformed JSON and an invalid mark.

## 7. Front end: dashboard

- [ ] 7.1 Rewrite `packages/front/src/Admin.js` as a dashboard. It loads the panels and draws a card per panel in a
  responsive grid, using the existing admin tab bar, `button-push_button` buttons and `admin-jobs-status-*` styles.
  Verify with a browser test that two seeded panels both render a chart.
- [ ] 7.2 Card states:
  - the latest run's error when it failed;
  - "No runs in this range" when there are none;
  - the truncation note.

  Verify with a browser test seeding a failed metric run.
- [ ] 7.3 Card Data view: a 50-row table with "showing 50 of N rows" and a JSON download. Verify with a browser test
  using 20 000 rows that the table appears within the test timeout.
- [ ] 7.4 Refresh: every 5 minutes while the page is visible, plus a header Refresh button. Verify with a front-end
  unit test using fake timers, and the button in the browser test.
- [ ] 7.5 Panel editor:
  - the form with fields from the metric list;
  - the JSON editor with debounced parsing;
  - a live preview;
  - Save, Delete, and Up and Down to reorder.

  Verify with a browser test that builds a stacked-bar panel through the form, saves it and sees it in the dashboard.
- [ ] 7.6 Remove `partial.lenses`, `chart.js` and `react-chartjs-2` if `grep` finds no other users. Verify that
  `yarn build` and the front-end unit tests pass.

## 8. Demo recordings and integration

- [ ] 8.1 Rewrite `test/lib/radiator-mock.js` and `test/lib/admin-radiator-steps.js`:
  - seed a panel through `POST /admin/radiator/panels`;
  - run a metric through `POST /admin/jobs/:name/run`;
  - assert the card draws.

  Keep `admin-radiator-local.js` and `admin-radiator-preview.js` differing only in seeding. The local test also seeds
  a large history through the database. Verify both pass with `yarn test:browser:demo`.
- [ ] 8.2 Run the full `yarn test`, `yarn test:browser` and front-end unit tests green. Open the pull request with the
  `demo-test` and `demo-preview` blocks naming the two radiator tests.

## Workflow follow-up

- The owner lists the saved lens-and-config presets (`SELECT radiator_config_name FROM radiator_config`) and recreates
  the ones still wanted as panels.
- A follow-up change removes the `/admin/radiator` and `/admin/radiator/config` routes and the lens and config columns.
- Archive the change after review.

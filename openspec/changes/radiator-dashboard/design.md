# Design

## Context

This builds on the radiator quick fix merged to `master`.

**Back end, after the quick fix:**

- `packages/back/jobs/radiator/radiator.js` turns each `jobs/radiator/queries/*.sql` file into a job.
  `run-query.js` fails any run that returns more than 1000 rows.
- Jobs are registered with `INSERT … ON CONFLICT DO NOTHING`. Since migration `20251103173055` added `job_enabled`
  with `DEFAULT FALSE`, they are created disabled, and no migration ever enabled them.
- Each run's rows land in `job_run.job_run_result` through `runJob` in `packages/back/job-scheduling.js`.
- `GET /admin/radiator` returns every run of every `*.sql` job of the past week.
- `radiator_config` stores named pairs of a lens and a Chart.js configuration.

**Front end, after the quick fix:**

- `packages/front/src/Admin.js` shows one chart at a time.
- The lens is run with `new Function`, given `partial.lenses` and `ramda` whole, which adds about 21 kB (gzipped) to
  the main bundle. `Admin` is imported directly by `App.js`, so every user downloads it.

**Preview analysis state:** the rule for "analysed" lives in `analysedCondition()` in
`packages/back/routes/admin/preview-audio.js`. It also defines the production embedding type and the stores that get
waveforms.

See proposal.md (Why) for the motivation and `specs/admin-radiator/spec.md` for the required behaviour.

## Goals / Non-Goals

**Goals:**

- A chart is data, not code. A saved panel is JSON that can be validated, and nothing typed in the view is run.
- The common chart takes a few form choices. The JSON editor is the escape hatch.
- Payloads stay small. Queries aggregate, results are capped, and each panel fetches only its own metric.

**Non-Goals:**

- Ad-hoc SQL from the view. Metrics stay reviewed queries in the repository.
- Per-admin dashboards. All admins share one set of panels.
- Alerting on metric values.
- Converting old lens-and-config pairs automatically.

## Decisions

### Metric history is flattened on the server

`GET /admin/radiator/metrics/:name?days=7` returns `{ rows: [{ time, ...row }], truncated }`. Each run's result
rows are expanded with the run's `started` time, newest runs first, up to 50 000 rows.

- **Why:** a time series is just more rows of the same table, which a declarative chart can use directly. The client
  needs no lens.
- **Alternative:** keep nested runs and reshape them in the browser with Vega-Lite's `flatten` transform. That is
  possible but makes every specification more complex and keeps the large payload.

`GET /admin/radiator/metrics` returns `[{ name, columns, lastRun: { started, success, error } }]`. The columns come
from the keys of the first row of the latest successful run. The form uses them to fill its field choices.

### Metrics written in JavaScript can sit beside the SQL files

`radiator.js` also loads `jobs/radiator/metrics/*.js`. Each exports `{ name, query }`, where `query` is a
`sql-template-strings` query, and runs through the same `runRadiatorQuery`. The SQL files stay as they are.

- **Why:** the analysis metrics must use the same rule for "analysed" as the prefetch job. Building them from
  `analysedCondition()` and its constants avoids copying the rule into SQL, where it would drift.
- **Alternative:** plain SQL files with the literals copied, plus a comment. That is simpler, but a silent drift
  would make the backlog numbers wrong without anyone noticing.

The radiator API lists jobs registered as radiator metrics (both kinds), not jobs filtered by name. That replaces the
`LIKE '%.sql'` filter.

### Jobs start enabled and run hourly; a migration fixes the existing ones

Registration becomes `INSERT INTO job (job_name, job_enabled) VALUES (…, TRUE) ON CONFLICT DO NOTHING`, with schedule
`17 * * * *` (minute 17, away from the top of the hour). Migration `…-enable-radiator-jobs` sets `job_enabled = TRUE`
and the hourly schedule once, for the radiator jobs that already exist.

- **Why:** `DO NOTHING` keeps an admin's later choices, as the spec requires.
- **Alternative:** `DO UPDATE SET job_enabled = TRUE` would re-enable a job an admin turned off on every restart.

### Panels use Vega-Lite specifications rendered with vega-embed

A panel stores `{ metric, days, spec, form }`:

- `spec` is a Vega-Lite specification without data. The view adds the data at render time as
  `{ values: rows }`.
- `form` holds the choices that produced `spec`, so the form can reopen them. It is `null` when the admin edited the
  JSON by hand. Editing in the form again then asks before overwriting the hand-written JSON.

The view uses vega-embed with `actions: false` and `renderer: 'svg'`. Specifications are checked as JSON and then
against the Vega-Lite schema before saving. Expressions inside a Vega-Lite specification are run by Vega's own
interpreter, not by JavaScript `eval`.

- **Why:**
  - Filtering, folding, aggregating, layering and tooltips are part of the format, which covers what lenses did.
  - The form only has to generate a small specification.
- **Alternative: keep Chart.js and translate the form into a Chart.js configuration.**
  - No new dependency.
  - But anything beyond the form needs code, which brings `eval` or a growing mapper back.
- **Alternative: Observable Plot.** Its options are JavaScript (functions as channels), so specifications are not
  plain JSON and cannot be stored and validated as data.

The form maps chart types as follows:

| Chart type | Vega-Lite |
|---|---|
| line | `mark: line`, x as `temporal` when it is `time`, otherwise as `nominal` |
| bar | `mark: bar` with `xOffset` from the series field |
| stacked bar | `mark: bar` with `color` from the series field |
| single number | `mark: text` of the latest row's first y field |

When several y fields are chosen, they become series through a `fold` transform. This mapping is a pure function with
unit tests.

### Panels are stored in radiator_config

A migration adds `radiator_config_panel JSONB` and `radiator_config_position INTEGER` to `radiator_config`. The lens
and config columns stay, nullable, so old pairs remain readable for manual conversion. They are dropped in a later
change.

- **Alternative:** a new `radiator_panel` table. That is cleaner, but the existing name uniqueness and admin routes
  already fit. Following the schema conventions either way, columns keep the table-name prefix.

The endpoints:

- `PUT /admin/radiator/panels/:id` and `POST /admin/radiator/panels` save a panel.
- `DELETE /admin/radiator/panels/:id` deletes one.
- `GET /admin/radiator/panels` lists them in position order.
- The old `/admin/radiator` and `/admin/radiator/config` routes are removed once the view no longer calls them.

### Dashboard layout and refresh

The view shows a responsive CSS grid of panel cards: one column on phones, two from the existing tablet breakpoint,
three on wide screens. Each card has:

- its title;
- the time of the latest run and its status, using the `admin-jobs-status-*` styles;
- the chart;
- `button-push_button` buttons for Data, Edit and Delete.

Moving panels uses up and down buttons that change their position. There is no drag-and-drop, which is not needed for
a handful of panels.

Refreshing:

- A shared timer refetches every panel's history every 5 minutes, and only while the page is visible
  (`document.visibilityState`).
- The header has a Refresh button.
- Each card fetches its own metric, so one slow metric does not hold up the others. Cards that show the same metric
  and range share one request.

The editor is a side panel, a bottom sheet on phones. It holds the form, the JSON editor (a textarea with debounced
parsing, like the quick fix) and a live preview drawn from the panel's current data.

### Admin pages load on demand

`App.js` loads the admin views with `React.lazy` inside a `Suspense` fallback. This moves Vega and the admin code out of
the main bundle. `partial.lenses` and `chart.js`/`react-chartjs-2` are removed when nothing else imports them (to be
checked with `grep` during implementation).

## Risks / Trade-offs

- **[Vega is large, about 300 kB gzipped]** → It is loaded only on the admin route through `React.lazy`. The main
  bundle gets smaller overall, because the quick fix's 21 kB of lenses also leaves it.
- **[Saved lens charts stop showing]** → The old rows are kept. Before removing the old view, the admins (today only
  the owner) recreate the few existing presets as panels. The task list includes listing them.
- **[Hourly analysis queries scan every preview]** → Check them with `EXPLAIN ANALYZE` on a production-sized copy
  first. If one takes more than a few seconds, run it every 6 hours instead. All the `EXISTS` lookups are on indexed
  `store__track_preview_id` columns.
- **[History of 30 days of hourly runs at 1000 rows each could reach 720 000 rows]** → The 50 000-row limit applies,
  with `truncated` shown on the panel. Metrics are expected to return a handful of rows.
- **[`job_run` cleanup deletes successful runs after 10 days]** → A 30-day range only works if radiator runs are kept
  longer. `updateJobs` keeps successful radiator runs for 31 days. They are small after the row cap.

## Migration Plan

1. Deploy the back end. The migrations add the panel columns, and enable and reschedule the radiator jobs. The new
   endpoints exist alongside the old ones.
2. Deploy the front end with the dashboard.
3. The owner recreates the old presets as panels.
4. A follow-up change removes the old routes and the lens and config columns.

To roll back, redeploy the previous build. The added columns and enabled jobs do not affect the old view.

## Open Questions

- Should the single-number chart type show a change since the previous run (for example "+120 since an hour ago")?
  It can be added to the form later without changing the stored format.

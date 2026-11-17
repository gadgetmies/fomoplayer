# Proposal

## Why

The admin Radiator view is meant to show at a glance how the service is doing, such as preview analysis progress and the
preview audio cache. In practice it is hard to use and easy to break:

- The API sends every row of every radiator query run of the past week.
- A chart is a lens expression run with `eval` plus a raw Chart.js configuration, and only one chart shows at a time.
- New radiator queries start out disabled, so their data never appears.

The quick fix on `master` stopped the freezing:

- a 1000-row cap on radiator query results;
- a summary table instead of the raw data text box;
- debounced chart redraws;
- lenses that work in production builds.

It does not make the view easy to use, so the view needs a proper design.

## What Changes

- **Radiator queries return small tables.** The 1000-row cap from the quick fix stays. Queries that list rows (such as
  `missing-previews.sql`) are aggregated. New metrics are added for the preview analysis pipeline:
  - fingerprint, embedding and waveform progress per store;
  - the analysis backlog;
  - the state of the preview audio cache.
- **Radiator query jobs start out enabled and run hourly.** Startup creates them enabled. A migration enables the
  existing ones once. A job an admin disables later stays disabled.
- **A per-metric API replaces the single dump.**
  - The first endpoint lists the metrics with their columns and the status of their latest run.
  - The second returns one metric's history as one flat table, each row carrying the time of its run.
  - **BREAKING** for scripts reading `GET /admin/radiator`, which is removed once the view no longer uses it.
- **Charts are saved panels.** A panel names a metric and a declarative chart specification (Vega-Lite). Admins build
  a panel with a form (metric, chart type, x, y, series, time range) or edit its specification as JSON.
  - **BREAKING** for saved lens-and-config pairs, which are not converted automatically.
- **The view becomes a dashboard.**
  - All saved panels show in a grid and refresh on their own.
  - A failed run shows its error instead of an empty chart.
  - Raw data shows as a table of the first rows with a JSON download.
  - Code typed into the view is never run.
- **The admin pages load on demand.** The chart and lens libraries are no longer part of the bundle every user
  downloads.

## Capabilities

### New Capabilities

- `admin-radiator`: The admin Radiator dashboard. It covers:
  - which radiator metrics exist and when they run;
  - the API that serves their history;
  - saved chart panels and how they are edited;
  - how the dashboard shows data, failures and raw rows.

### Modified Capabilities

None. No existing spec covers the radiator.

## Impact

- **Back end:**
  - `packages/back/jobs/radiator/` (queries, job creation, row cap)
  - `packages/back/routes/admin/api.js` and `packages/back/routes/admin/db.js` (radiator endpoints)
  - a migration for panel storage and enabling the existing radiator jobs
- **Front end:**
  - `packages/front/src/Admin.js`, rewritten as a dashboard with panel components
  - `packages/front/src/App.js` (lazy admin route)
  - a new dependency on `vega-embed` with `vega` and `vega-lite`, loaded only on the admin pages
  - `chart.js`, `react-chartjs-2` and `partial.lenses` are removed if nothing else uses them
- **Data:** the `radiator_config` table gains a panel specification and a position. Existing rows are kept for
  reference but are not shown as panels.
- **Tests:**
  - back-end API tests for the new endpoints, the row cap and job enabling
  - front-end unit tests for the form-to-specification mapping
  - the admin Radiator demo-test and demo-preview pair, rewritten to seed a panel and assert it draws

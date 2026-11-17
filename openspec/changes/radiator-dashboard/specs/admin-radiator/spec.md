# Spec Delta

## Purpose

The admin Radiator dashboard shows how the service is doing over time: scheduled metric queries record small tables,
and admins arrange charts of their history into a dashboard that refreshes on its own.

## ADDED Requirements

### Requirement: Radiator metrics run without manual enabling
Each radiator metric SHALL be a scheduled job that is enabled when it is first registered. It SHALL run hourly unless
an admin changes its schedule. Registering metrics again at startup SHALL NOT re-enable a metric an admin disabled or
change a schedule an admin set.

#### Scenario: A new metric is deployed
- **WHEN** a deployment adds a radiator metric that the database does not yet know
- **THEN** the metric's job is enabled and scheduled hourly, and its first run's results appear without an admin
  enabling it

#### Scenario: An admin disabled a metric
- **WHEN** an admin has disabled a radiator metric and the backend restarts
- **THEN** the metric stays disabled and does not run

### Requirement: Radiator metric results are small
A radiator metric run SHALL store at most 1000 result rows. A run whose query returns more rows SHALL be recorded as
failed with an error naming the row count and the limit, and SHALL store none of the rows.

#### Scenario: A query returns too many rows
- **WHEN** a radiator query returns 1001 rows
- **THEN** the run is recorded as failed, its error says it returned 1001 rows, more than the 1000 allowed, and no
  rows are stored

### Requirement: Preview analysis metrics
The radiator SHALL include metrics for the preview analysis pipeline:
- per store, the previews, missing previews and previews with a fingerprint, a production embedding and a waveform;
- the backlog of previews still to analyse and how many of them have stored audio;
- the preview audio cache: stored files, their total size, failed downloads and previews too large to download.

#### Scenario: Analysis progress per store
- **WHEN** the analysis metric runs with Bandcamp previews of which some have a waveform
- **THEN** its Bandcamp row counts the previews and the previews with a waveform, fingerprint and production embedding

#### Scenario: Backlog of unprefetchable previews
- **WHEN** a Bandcamp preview needs analysis but its release page is unknown
- **THEN** the backlog metric counts it among the previews that cannot be prefetched, apart from the other backlog

### Requirement: Radiator metric list
The admin API SHALL list the radiator metrics without their results. For each metric it SHALL give the name, the
column names of its latest successful run, and the time, status and error of its latest run.

#### Scenario: Listing metrics
- **WHEN** an admin requests the metric list and a metric's latest run failed
- **THEN** that metric is listed with the failed status and the run's error, and no result rows are returned

#### Scenario: A non-admin requests the list
- **WHEN** a signed-in user who is not an admin requests the metric list
- **THEN** the request is refused

### Requirement: Radiator metric history
The admin API SHALL return one metric's history over a requested time range as a single table. It SHALL have one row
per result row of each successful run in the range, with the run's start time added as `time`. The range SHALL
default to 7 days and SHALL NOT exceed 30 days. A history SHALL hold at most 50 000 rows, from the newest runs, and
SHALL say when older runs were left out.

#### Scenario: Two runs of a metric
- **WHEN** a metric has two successful runs in the past day, each returning two rows, and its history for one day is
  requested
- **THEN** the response has four rows, each with its run's `time` and the query's columns

#### Scenario: A range beyond the limit
- **WHEN** a history of 90 days is requested
- **THEN** the response covers at most the past 30 days

#### Scenario: A history beyond the row limit
- **WHEN** the requested range holds 60 000 result rows
- **THEN** the response holds the 50 000 rows of the newest runs and says that older runs were left out

### Requirement: Saved panels
An admin SHALL be able to save, update and delete named panels. Each panel SHALL name one metric, a time range, a
declarative chart specification and its position in the dashboard. Every admin SHALL see the same saved panels.

#### Scenario: Saving a panel
- **WHEN** an admin saves a panel named "Analysis progress" for the analysis metric
- **THEN** the panel appears in the dashboard of every admin, in its saved position

#### Scenario: Deleting a panel
- **WHEN** an admin deletes a panel
- **THEN** it no longer appears in the dashboard

### Requirement: Building a panel with a form
The panel editor SHALL let an admin build a chart by choosing a metric, a chart type (line, bar, stacked bar or single
number), an x field, one or more y fields, an optional field that splits the data into series and a time range. The
field choices SHALL be the chosen metric's columns and `time`.

#### Scenario: A stacked bar per store
- **WHEN** an admin chooses the analysis metric, a stacked bar, x `store_name` and y `fingerprinted` and `previews`
- **THEN** the preview shows a stacked bar per store with the two values

### Requirement: Editing a panel's specification
The panel editor SHALL let an admin edit the panel's chart specification as JSON. An invalid specification SHALL be
shown as an error in the editor and SHALL NOT be saved. The view SHALL NOT run code typed into the editor.

#### Scenario: Invalid JSON
- **WHEN** an admin types malformed JSON into the specification editor
- **THEN** the editor shows the parse error, the last valid preview stays, and saving is disabled

### Requirement: Dashboard display
The Radiator view SHALL show all saved panels at once. It SHALL refresh their data every 5 minutes and when the admin
asks for it.

#### Scenario: Automatic refresh
- **WHEN** the Radiator view has been open for 5 minutes
- **THEN** every panel's data is fetched again and its chart redrawn

### Requirement: Failed and empty metrics are shown
A panel SHALL show its metric's latest error when the latest run failed. It SHALL say so when the time range holds no
runs, instead of drawing an empty chart.

#### Scenario: A failing metric
- **WHEN** a panel's metric failed in its latest run
- **THEN** the panel shows the error message and the time of the failed run

### Requirement: Raw data of a panel
A panel SHALL show its data as a read-only table of at most the first 50 rows on request. It SHALL offer the panel's
full data as a JSON download. The view SHALL stay responsive with a panel holding a full 30 days of hourly runs.

#### Scenario: Viewing a panel's data
- **WHEN** an admin opens the data of a panel whose history holds 20 000 rows
- **THEN** a table of 50 rows appears with a note that 50 of 20 000 rows are shown, and a download offers all 20 000

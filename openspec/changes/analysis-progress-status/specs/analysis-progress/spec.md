## ADDED Requirements

### Requirement: The analyser MUST show preview analysis progress in its tmux session

`analyse_all.sh` MUST give its session two status lines (short enough for a
phone-width client) showing, for the
previews of the prefetched stores: how many unanalysed previews have audio
in the bucket, how many are unanalysed in total, the total number of
previews, the analysis rate per hour and the estimated time to finish.

#### Scenario: Progress is shown
- **WHEN** the session is running and the database is reachable
- **THEN** the status lines read like `bucket 973 · left 21454/139423` and `440/h · ETA 2d 1h`

#### Scenario: Rate not yet known
- **WHEN** fewer than ten minutes of counts have been recorded
- **THEN** the rate and estimate are shown as `…`

### Requirement: Progress counts MUST be cached and read-only

The progress script MUST open its database transactions read-only and MUST
NOT query the database more often than once per refresh interval (default
300 s); between refreshes it prints the cached line. When a refresh fails it
MUST print the last cached line marked stale, or a short error when there is
none, and exit 0 so tmux keeps the line.

#### Scenario: Cached between refreshes
- **WHEN** the script runs twice within the refresh interval
- **THEN** the database is queried once

#### Scenario: Database unreachable
- **WHEN** the refresh fails and an earlier line is cached
- **THEN** that line is printed with a `(stale)` marker

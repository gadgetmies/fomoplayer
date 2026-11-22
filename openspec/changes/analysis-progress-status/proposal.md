# Proposal

## Why

The `analyser` tmux session shows only the worker's own counters ("2067
preview(s) done"), not how much is left. There is no way to see, without
querying the database by hand, how many previews are waiting in the bucket,
how many still need analysing in total, how fast the backlog is shrinking or
when it will be done.

## What Changes

- New script `analyser/analysis_progress.py`: counts, from the production
  database (read-only), the previews of the prefetched stores (Bandcamp,
  Beatport) in total, those not yet analysed, and those not yet analysed
  whose audio is in the bucket. "Analysed" is the backend's
  `analysedCondition` in `packages/back/routes/admin/preview-audio.js`. It
  keeps the counts in a cache file for five minutes, derives the analysis
  rate from the growth of the analysed count over about the last hour, and
  prints the counts and the rate with an estimated time to finish.
- `analyse_all.sh` adds two tmux status lines to the session (counts, then
  rate and estimate; two short lines fit a phone-width client), refreshed
  every 30 seconds (the database is asked at most once per five minutes).
  `--no-progress` leaves them out.

## Impact

- Read-only queries against the production database, one every five
  minutes while a tmux client is attached (about 3 s each).
- No backend or schema change.

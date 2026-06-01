## ADDED Requirements

### Requirement: Bulk server-side scoring endpoint MUST score and persist matches for one, many, or all samples

`POST /api/admin/exact-match/audio-samples/matches` MUST accept an
optional JSON body with two optional fields:

- `sample_ids`: array of integer sample IDs. When omitted, the
  endpoint MUST score every sample returned by
  `queryAudioSamplesWithFingerprint` (i.e. every sample with
  fingerprints). When supplied as an empty array, the endpoint MUST
  respond `400`.
- `threshold`: float. When omitted, the endpoint MUST use
  `config.sampleMatchDefaultThreshold` (the same default
  `findExactMatchForSample` uses for the same field).

For each resolved sample the endpoint MUST call
`findExactMatchForSample(sampleId, threshold)` then
`persistSampleMatches(sampleId, matches, threshold, bucketSeconds)`
where `bucketSeconds = config.sampleMatchBucketSeconds ?? 0.05`.
Iteration MUST be sequential server-side.

The response on success MUST be `200` with body:

```
{
  "ok_count":  <integer>,
  "fail_count": <integer>,
  "results": [
    { "sample_id": <int>, "status": "ok",    "match_count": <int>, "top_score": <int | null> },
    { "sample_id": <int>, "status": "error", "error":       <string> },
    ...
  ]
}
```

`top_score` MUST be the `match_score` field from the first row of
`findExactMatchForSample`'s output (i.e. the highest-scoring match),
or `null` when `match_count == 0`. The response MUST NOT include the
full match arrays.

The endpoint MUST reuse the same admin authentication middleware as
the existing `/admin/exact-match/audio-samples/:sampleId/match`
endpoint.

#### Scenario: Omitted sample_ids scores every sample with fingerprints

- **WHEN** an admin caller POSTs the endpoint with body `{}`
- **THEN** the response is `200` and `results` contains one entry
  per row returned by `queryAudioSamplesWithFingerprint`

#### Scenario: Explicit sample_ids scores the named subset

- **WHEN** an admin caller POSTs with body
  `{ "sample_ids": [1, 2, 3] }` and all three samples exist with
  fingerprints
- **THEN** the response is `200` and `results` contains exactly
  three entries with `sample_id` values `1`, `2`, `3`

#### Scenario: Empty sample_ids array returns 400

- **WHEN** an admin caller POSTs with body `{ "sample_ids": [] }`
- **THEN** the response is `400` and no scoring or persistence is
  performed

#### Scenario: Threshold override is honoured

- **WHEN** an admin caller POSTs with body
  `{ "sample_ids": [42], "threshold": 0.5 }`
- **THEN** `findExactMatchForSample` is called with
  `threshold = 0.5` and `persistSampleMatches` is called with the
  same `0.5` as its `threshold` argument

#### Scenario: Omitted threshold falls back to config

- **WHEN** `config.sampleMatchDefaultThreshold` is `0.01` and an
  admin caller POSTs with body `{ "sample_ids": [42] }`
- **THEN** `findExactMatchForSample` is called with
  `threshold = 0.01`

### Requirement: Bulk endpoint MUST be best-effort across samples

A per-sample exception during `findExactMatchForSample` or
`persistSampleMatches` MUST be caught and recorded in `results` as
`{ sample_id, status: "error", error: <e.message> }`. The endpoint
MUST continue to the next sample and MUST NOT abort the request.
Per-sample errors MUST also be logged at `error` level via the
shared logger.

The overall response status MUST be `200` even when
`fail_count > 0`. The endpoint MUST return `500` only for failures
that occur before the per-sample loop starts (e.g. failure of the
sample-list query).

#### Scenario: One sample fails, others succeed

- **WHEN** the bulk endpoint is called with three sample IDs and
  the middle sample throws inside `findExactMatchForSample`
- **THEN** the response is `200` with `ok_count: 2`,
  `fail_count: 1`, the failing entry has `status: "error"` and an
  `error` field, and the other two entries have `status: "ok"`

#### Scenario: Sample-list query failure returns 500

- **WHEN** the bulk endpoint is called with no `sample_ids` and the
  internal `queryAudioSamplesWithFingerprint` query throws
- **THEN** the response is `500` with the error message in the body

### Requirement: Bulk endpoint MUST persist results into user_notification_audio_sample_match

For each sample with `status: "ok"`, the rows returned by
`findExactMatchForSample` MUST be written into
`user_notification_audio_sample_match` via the existing
`persistSampleMatches` helper, which replaces (DELETE then INSERT)
the sample's prior rows inside a single transaction.

The persisted rows MUST carry the effective `threshold` and the
effective `bucket_seconds` used for the scoring pass in the
`user_notification_audio_sample_match_threshold` and
`user_notification_audio_sample_match_bucket_seconds` columns
respectively.

#### Scenario: Successful scoring pass populates the table

- **WHEN** the bulk endpoint scores a sample whose
  `findExactMatchForSample` returns three matches and
  `user_notification_audio_sample_match` previously had zero rows
  for that sample
- **THEN** after the request returns, the table contains exactly
  three rows for that sample, each with the effective threshold
  and bucket-seconds in the corresponding columns

#### Scenario: Re-scoring replaces prior matches for the sample

- **WHEN** the bulk endpoint is called twice for the same sample
  and the second pass produces a different set of matches
- **THEN** after the second request, the table contains only the
  rows produced by the second pass — no leftover rows from the
  first

### Requirement: Analyser worker MUST persist scoring results to the server, not a local file

`analyser/panako_processor.py` MUST send its `--score-after N`
scoring pass to the bulk endpoint
`POST /admin/exact-match/audio-samples/matches` with no body
(meaning "all samples with fingerprints"). The worker MUST NOT
maintain a local `sample_match_results.jsonl` file or any other
local persistence of match results.

For each entry in the endpoint's `results` array the worker MUST
print one summary line containing the sample ID, the filename when
available, the `match_count`, and the `top_score`. A `404` response
(endpoint not deployed) MUST be handled by logging a clear message
and skipping the scoring pass without raising.

#### Scenario: Worker POSTs the bulk endpoint and logs per-sample results

- **WHEN** the worker hits its `--score-after` threshold
- **THEN** it issues exactly one `POST /admin/exact-match/audio-samples/matches`
  request with no body, parses the response, and prints one log
  line per entry in `results`

#### Scenario: Worker handles missing endpoint gracefully

- **WHEN** the bulk endpoint returns `404`
- **THEN** the worker logs a message identifying the endpoint and
  the scoring pass is skipped without an exception

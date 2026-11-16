# Proposal

## Why

Each `POST /embed` to the production embedding service makes Essentia print
`[ WARNING ] No network created, or last created network has been deleted...`
about 2,000 times (2,083 for a 12-second clip). On the first real request
Railway hit its 500 lines/second limit and dropped 3,407 lines, including the
service's own request line, so a real error could be lost the same way.

## What Changes

- The embedding service turns Essentia's warning output off at start-up.
  Essentia's errors stay on; embeddings are unchanged (bit-identical vectors
  with warnings on and off).
- The analyser workers run by hand (`main.py` and others) keep Essentia's
  warnings.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
None. Logging only; the change sets `skip_specs: true`.

## Impact

- `analyser/embedding_service.py`, `analyser/test_embedding_service.py`.
  Takes effect when the `embedding` Railway service redeploys on merge.

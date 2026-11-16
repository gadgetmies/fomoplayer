# Design

## Context

See proposal.md. The too-short check is `len(embeddings) == 0` after the
model runs; the duration is only used in the log line.

## Goals / Non-Goals

**Goals:** the too-short branch reports the preview missing again, with the
duration in its log line.

**Non-Goals:** changing when a preview counts as too short.

## Decisions

- **Duration from the WAV header** (`frames / rate` via `wave`): the file is
  the 16-bit PCM WAV `to_wav` just wrote, so no decode or extra dependency is
  needed. Alternative: drop the duration from the message; rejected because
  it is the one fact an operator needs to see why a preview was skipped.

## Risks / Trade-offs

- [Other leftover pydub names] → `pyflakes` over the analyser worker modules
  on `master` finds no other undefined name.

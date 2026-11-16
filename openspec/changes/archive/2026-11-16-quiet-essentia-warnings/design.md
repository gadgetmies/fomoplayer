# Design

## Context

See proposal.md. The warning comes from Essentia's C++ logger during each
embedding call and is written straight to file descriptor 2, so Python-level
stderr redirection does not catch it.

## Goals / Non-Goals

**Goals:** no Essentia warning flood from the service; errors still logged.

**Non-Goals:** finding which Essentia algorithm emits the warning, or
changing the analyser workers' logging.

## Decisions

- **`essentia.log.warningActive = False` in the service's `main()`**: the
  documented switch for Essentia's warning channel; errors use a separate
  channel. Doing it in `main()` rather than at import keeps `embedding.py`
  shared with `main.py` unchanged, and tests that build the server directly
  keep default logging.
- **Test through a subprocess**: the warning goes to file descriptor 2, so the
  test runs one embedding in a child process with and without the switch and
  compares the child's stderr.

## Risks / Trade-offs

- [A useful Essentia warning is hidden in the service] → the service only
  decodes and embeds; real failures raise and are logged with a traceback on
  stderr.

# Design

## Context

See proposal.md. The script is a local diagnostic that talks to a Postgres
database directly (`DB_DSN`), unlike the workers, which go through the API.

## Goals / Non-Goals

**Goals:** a venv from `requirements.txt` can run the script and its test.

**Non-Goals:** moving to psycopg 3, or splitting the requirements per worker.

## Decisions

- **`psycopg2-binary`, not `psycopg2`:** the source package needs `libpq`
  headers and a compiler on every analyser host; the binary wheel does not,
  and the code is unchanged either way.
- **Pin 2.9.10:** the first 2.9 release with Python 3.13 wheels, matching the
  pinned style of the rest of the file.

## Risks / Trade-offs

- [psycopg2 maintainers advise against the binary package in production
  libraries] → this is a single-host diagnostic script, not a library.

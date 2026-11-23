## 1. Migration

- [x] 1.1 Drop both frequency-bin indexes in production with `DROP INDEX CONCURRENTLY` (done 2026-11-23).
- [x] 1.2 Add the migration (up: `DROP INDEX IF EXISTS`; down: recreate) and run the full back-end suite, which resets and re-applies every migration.

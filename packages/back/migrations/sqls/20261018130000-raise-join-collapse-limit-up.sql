-- Raise the planner's join/from collapse limits from the default 8 to 16 for
-- every connection to this database.
--
-- The track search (searchForTracks) lists 12+ relations in one FROM/join
-- list. Beyond join_collapse_limit relations the planner stops reordering
-- joins and follows the written order, so it built the full-catalogue join
-- (~760k rows, with a multi-second seq scan of store__track) before applying
-- the selective sample-match semi-join: 7.8 s instead of 0.15 s for
-- `sample:~<id>` searches (measured 2026-10-17). At 16 the planner reorders
-- freely; geqo_threshold (12) caps planning cost for the widest lists.
-- The only other query level in the schema wider than 8 relations is
-- track_details()'s outer 11-way join, which stays below the GEQO threshold
-- and gets exhaustive (optimal) planning. Applied at the database level so
-- the setting is versioned here rather than living as invisible config, and
-- so every connection benefits without per-query SETs.
--
-- Takes effect on new connections only; the deploy's restart picks it up.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET join_collapse_limit = 16', current_database());
  EXECUTE format('ALTER DATABASE %I SET from_collapse_limit = 16', current_database());
END
$$;

-- Back to the PostgreSQL defaults (8/8).
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I RESET join_collapse_limit', current_database());
  EXECUTE format('ALTER DATABASE %I RESET from_collapse_limit', current_database());
END
$$;

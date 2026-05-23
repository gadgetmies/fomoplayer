ALTER TABLE radiator_config DROP COLUMN radiator_config_config;
ALTER TABLE radiator_config DROP COLUMN radiator_config_lens;

-- Restore the nullable JSON columns the 20231225110516 migration created. The
-- previous `NOT NULL` here made `db-migrate reset` fail whenever radiator_config
-- held any rows (e.g. seeded presets), since this revert runs before the table
-- is dropped.
ALTER TABLE radiator_config ADD COLUMN radiator_config_config JSON;
ALTER TABLE radiator_config ADD COLUMN radiator_config_lens JSON;
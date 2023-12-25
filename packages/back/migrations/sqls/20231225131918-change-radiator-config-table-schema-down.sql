ALTER TABLE radiator_config DROP COLUMN radiator_config_config;
ALTER TABLE radiator_config DROP COLUMN radiator_config_lens;

ALTER TABLE radiator_config ADD COLUMN radiator_config_config JSON NOT NULL;
ALTER TABLE radiator_config ADD COLUMN radiator_config_lens JSON NOT NULL;
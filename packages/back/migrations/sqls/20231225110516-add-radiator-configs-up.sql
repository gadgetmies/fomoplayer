CREATE TABLE IF NOT EXISTS radiator_config
(
    radiator_config_id     SERIAL PRIMARY KEY,
    radiator_config_name   TEXT NOT NULL UNIQUE,
    radiator_config_lens   json,
    radiator_config_config json
);
CREATE TABLE api_key (
  api_key_id              SERIAL PRIMARY KEY,
  api_key_hash            TEXT NOT NULL UNIQUE,
  api_key_prefix          TEXT NOT NULL,
  api_key_name            TEXT NOT NULL,
  meta_account_user_id    INTEGER NOT NULL REFERENCES meta_account,
  api_key_created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  api_key_last_used_at    TIMESTAMPTZ,
  api_key_revoked_at      TIMESTAMPTZ,
  rate_limit_per_minute   INTEGER NOT NULL DEFAULT 60,
  rate_limit_per_day      INTEGER NOT NULL DEFAULT 1000
);
CREATE INDEX api_key_user_idx ON api_key (meta_account_user_id);

CREATE TABLE extension_refresh_token (
  extension_refresh_token_id            SERIAL PRIMARY KEY,
  extension_refresh_token_hash          TEXT NOT NULL UNIQUE,
  meta_account_user_id                  INTEGER NOT NULL REFERENCES meta_account,
  extension_refresh_token_extension_id  TEXT NOT NULL,
  extension_refresh_token_chain_id      UUID NOT NULL,
  extension_refresh_token_replaced_by   INTEGER REFERENCES extension_refresh_token,
  extension_refresh_token_created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  extension_refresh_token_expires_at    TIMESTAMPTZ NOT NULL,
  extension_refresh_token_last_used_at  TIMESTAMPTZ,
  extension_refresh_token_revoked_at    TIMESTAMPTZ
);

CREATE INDEX extension_refresh_token_user_idx
  ON extension_refresh_token (meta_account_user_id);

CREATE INDEX extension_refresh_token_chain_idx
  ON extension_refresh_token (extension_refresh_token_chain_id);

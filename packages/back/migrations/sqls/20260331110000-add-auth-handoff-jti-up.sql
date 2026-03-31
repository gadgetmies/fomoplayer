CREATE TABLE auth_handoff_jti (
  auth_handoff_jti_value TEXT PRIMARY KEY,
  auth_handoff_jti_expires_at TIMESTAMP NOT NULL,
  auth_handoff_jti_consumed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX auth_handoff_jti_expires_at_idx
  ON auth_handoff_jti (auth_handoff_jti_expires_at);

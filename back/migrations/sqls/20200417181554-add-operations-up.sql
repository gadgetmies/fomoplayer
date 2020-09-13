CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE meta_operation (
    meta_operation_uuid UUID NOT NULL default uuid_generate_v4() PRIMARY KEY,
    meta_operation_name TEXT NOT NULL,
    meta_operation_created TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    meta_operation_finished TIMESTAMPTZ,
    meta_operation_error BOOLEAN,
    meta_account_user_id INTEGER REFERENCES meta_account(meta_account_user_id) NOT NULL,
    meta_operation_data JSONB
);

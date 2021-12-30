CREATE TABLE meta_account_email
(
    meta_account_email_id                SERIAL PRIMARY KEY,
    meta_account_user_id                 INTEGER UNIQUE REFERENCES meta_account (meta_account_user_id),
    meta_account_email_address           email   NOT NULL,
    meta_account_email_verification_code UUID    NOT NULL,
    meta_account_email_verified          BOOLEAN NOT NULL DEFAULT FALSE
);

-- Global, account-wide email suppression list. Keyed by address (not account
-- id) so invite recipients with no account can be suppressed too. The `email`
-- domain is citext, giving case-insensitive uniqueness/matching for addresses.
CREATE TABLE email_unsubscribe
(
    email_unsubscribe_id         SERIAL PRIMARY KEY,
    email_unsubscribe_address    email        NOT NULL UNIQUE,
    email_unsubscribe_created_at timestamptz  NOT NULL DEFAULT now(),
    email_unsubscribe_source     text
);

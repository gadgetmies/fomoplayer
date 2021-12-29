CREATE
EXTENSION IF NOT EXISTS citext;

CREATE DOMAIN email AS citext
    CHECK ( value ~ '^[a-zA-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$' );

CREATE TABLE email_queue
(
    email_queue_id            SERIAL PRIMARY KEY,
    email_queue_sender        email       NOT NULL,
    email_queue_recipient     email       NOT NULL,
    email_queue_subject       TEXT        NOT NULL,
    email_queue_plain         TEXT        NOT NULL,
    email_queue_html          TEXT        NOT NULL,
    email_queue_requested     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    email_queue_sent          TIMESTAMPTZ,
    email_queue_last_attempt  TIMESTAMPTZ,
    email_queue_last_error    TEXT,
    email_queue_attempt_count INTEGER     NOT NULL DEFAULT 0
)
CREATE TABLE cart__store
(
    cart__store_id               SERIAL PRIMARY KEY,
    cart_id                      INTEGER REFERENCES cart (cart_id)   NOT NULL,
    store_id                     INTEGER REFERENCES store (store_id) NOT NULL,
    cart__store_cart_store_id    TEXT                                NOT NULL,
    cart__store_cart_url         TEXT,
    cart__store_updated          timestamptz                         NOT NULL DEFAULT NOW(),
    cart__store_store_version_id TEXT,
    UNIQUE (cart_id, store_id)
);

CREATE TABLE user__store_authorization
(
    user__store_authorization_id            SERIAL PRIMARY KEY,
    meta_account_user_id                    INTEGER REFERENCES meta_account (meta_account_user_id),
    store_id                                INTEGER REFERENCES store (store_id),
    user__store_authorization_access_token  bytea       NOT NULL,
    user__store_authorization_refresh_token bytea       NOT NULL,
    user__store_authorization_expires       timestamptz NOT NULL,
    UNIQUE (meta_account_user_id, store_id)
);

INSERT
INTO
    job (job_name)
VALUES
    ('syncCarts');

INSERT
INTO
    job_schedule (job_id, job_schedule)
SELECT
    job_id
  , '*/15 * * * *'
FROM
    job
WHERE
    job_name = 'syncCarts';
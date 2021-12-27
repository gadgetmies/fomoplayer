CREATE TABLE authentication_method
(
    authentication_method_id   SERIAL PRIMARY KEY,
    authentication_method_name TEXT UNIQUE NOT NULL,
    authentication_method_code TEXT UNIQUE NOT NULL
);

CREATE TABLE meta_account__authentication_method_details
(
    meta_account__authentication_method_details_id      SERIAL PRIMARY KEY,
    authentication_method_id                            INTEGER REFERENCES authentication_method (authentication_method_id) NOT NULL,
    meta_account_user_id                               INTEGER REFERENCES meta_account (meta_account_user_id)            NOT NULL,
    meta_account__authentication_method_details_details JSONB                                                             NOT NULL,
    UNIQUE (meta_account__authentication_method_details_id, meta_account_user_id)
);

INSERT INTO authentication_method (authentication_method_id, authentication_method_name, authentication_method_code)
VALUES (1, 'e-mail login', 'email');

INSERT INTO authentication_method (authentication_method_id, authentication_method_name, authentication_method_code)
VALUES (2, 'OIDC', 'oidc');

INSERT INTO authentication_method (authentication_method_id, authentication_method_name, authentication_method_code)
VALUES (3, 'Telegram bot login', 'telegram-bot');

INSERT INTO meta_account__authentication_method_details (meta_account_user_id,
                                                        authentication_method_id,
                                                        meta_account__authentication_method_details_details)
SELECT meta_account_user_id,
       2,
       json_build_object('issuer', meta_account_user_id_issuer, 'subject',
                         meta_account_user_id_subject) AS meta_account__authentication_method_details_details
FROM meta_account
WHERE meta_account_user_id_issuer IS NOT NULL;

INSERT INTO meta_account__authentication_method_details (meta_account_user_id,
                                                        authentication_method_id,
                                                        meta_account__authentication_method_details_details)
SELECT meta_account_user_id,
       1,
       json_build_object('username', meta_account_username, 'password',
                         meta_account_passwd) AS meta_account__authentication_method_details_details
FROM meta_account
WHERE meta_account_passwd IS NOT NULL;

ALTER TABLE meta_account
    DROP
        COLUMN meta_account_user_id_issuer,
    DROP
        COLUMN meta_account_user_id_subject,
    DROP
        COLUMN meta_account_username,
    DROP
        COLUMN meta_account_passwd;

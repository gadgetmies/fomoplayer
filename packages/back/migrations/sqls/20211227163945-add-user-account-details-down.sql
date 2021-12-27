ALTER TABLE meta_account
    ADD
        COLUMN meta_account_user_id_issuer  TEXT,
    ADD
        COLUMN meta_account_user_id_subject TEXT,
    ADD
        COLUMN meta_account_username        VARCHAR(50),
    ADD
        COLUMN meta_account_passwd          VARCHAR(100);

WITH account_details AS (
    SELECT meta_account_user_id,
           meta_account__authentication_method_details_details ->> 'username' AS username,
           meta_account__authentication_method_details_details ->> 'password' AS password
    FROM meta_account__authentication_method_details
    WHERE authentication_method_id =
          (SELECT authentication_method_id FROM authentication_method WHERE authentication_method_code = 'email')
)
UPDATE meta_account ma
SET meta_account_username = username,
    meta_account_passwd   = password
FROM account_details
WHERE ma.meta_account_user_id = account_details.meta_account_user_id;

WITH account_details AS (
    SELECT meta_account_user_id,
           meta_account__authentication_method_details_details ->> 'issuer'  AS issuer,
           meta_account__authentication_method_details_details ->> 'subject' AS subject
    FROM meta_account__authentication_method_details
    WHERE authentication_method_id =
          (SELECT authentication_method_id FROM authentication_method WHERE authentication_method_code = 'oidc')
)
UPDATE meta_account ma
SET meta_account_username        = issuer || '_' || subject,
    meta_account_user_id_issuer  = issuer,
    meta_account_user_id_subject = subject
FROM account_details
WHERE ma.meta_account_user_id = account_details.meta_account_user_id;

DROP TABLE meta_account__authentication_method_details;
DROP TABLE authentication_method;

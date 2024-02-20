ALTER TABLE cart DROP CONSTRAINT cart_cart_name_meta_account_user_id_key;
ALTER TABLE cart
  ADD COLUMN cart_deleted TIMESTAMPTZ;
;

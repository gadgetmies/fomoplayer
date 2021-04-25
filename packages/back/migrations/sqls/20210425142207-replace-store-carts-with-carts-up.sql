DROP TABLE store__track__cart;

ALTER TABLE cart
  ADD COLUMN cart_is_default BOOLEAN;
ALTER TABLE cart
  ADD CONSTRAINT cart_meta_account_user_id_cart_is_default_key
    UNIQUE (meta_account_user_id, cart_is_default);

CREATE TABLE track__cart
(
  track__cart_id SERIAL PRIMARY KEY,
  cart_id        INTEGER REFERENCES cart (cart_id),
  track_id       INTEGER REFERENCES track (track_id),
  UNIQUE (cart_id, track_id)
);

INSERT INTO cart
  (cart_name, meta_account_user_id, cart_is_default)
SELECT
  'Default'
, meta_account_user_id
, TRUE
FROM meta_account;

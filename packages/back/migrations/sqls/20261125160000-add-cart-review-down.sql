ALTER TABLE cart
  DROP COLUMN cart_is_in_review;

ALTER TABLE track__cart
  DROP COLUMN track__cart_review_state;

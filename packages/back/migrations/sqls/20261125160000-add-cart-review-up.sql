-- Cart review: a review state per cart membership (NULL = to review) and a review switch per cart.
ALTER TABLE track__cart
  ADD COLUMN track__cart_review_state TEXT NULL,
  ADD CONSTRAINT track__cart_review_state_valid CHECK (track__cart_review_state IN ('accepted', 'rejected'));

ALTER TABLE cart
  ADD COLUMN cart_is_in_review BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE store__track__cart
(
  store_id INTEGER REFERENCES store (store_id),
  track_id INTEGER REFERENCES track (track_id),
  UNIQUE (store_id, track_id)
);

DROP TABLE track__cart;

DELETE
FROM cart;

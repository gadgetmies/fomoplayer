CREATE TABLE cart (
    cart_id SERIAL PRIMARY KEY,
    cart_name TEXT NOT NULL,
    meta_account_user_id INTEGER REFERENCES meta_account(meta_account_user_id),
    UNIQUE (cart_name, meta_account_user_id)
);

CREATE TABLE store__track__cart (
    store_id INTEGER REFERENCES store(store_id),
    track_id INTEGER REFERENCES track(track_id),
    UNIQUE (store_id, track_id)
);

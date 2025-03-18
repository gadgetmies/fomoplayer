CREATE INDEX idx_store__track_track_id ON store__track(track_id);
CREATE INDEX idx_store__track_store_id ON store__track(store_id);
CREATE INDEX idx_store__track_preview_store__track_id ON store__track_preview(store__track_id);
CREATE INDEX idx_store__track_preview_embedding_preview_id ON store__track_preview_embedding(store__track_preview_id);
CREATE INDEX idx_track__cart_track_id ON track__cart(track_id);
CREATE INDEX idx_track__cart_cart_id ON track__cart(cart_id);

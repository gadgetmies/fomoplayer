ALTER TABLE cart ADD COLUMN cart_uuid uuid DEFAULT uuid_generate_v4();

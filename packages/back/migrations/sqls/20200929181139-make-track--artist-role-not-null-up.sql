UPDATE track__artist SET track__artist_role = 'author' WHERE track__artist_role IS NULL;
ALTER TABLE track__artist ALTER COLUMN track__artist_role SET NOT NULL;

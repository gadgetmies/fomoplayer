CREATE TABLE bandcamp_entity_check (
  bandcamp_entity_check_id SERIAL PRIMARY KEY,
  bandcamp_entity_check_entity_type TEXT NOT NULL CHECK (bandcamp_entity_check_entity_type IN ('artist', 'label')),
  bandcamp_entity_check_entity_id INTEGER NOT NULL,
  bandcamp_entity_check_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bandcamp_entity_check_entity_type, bandcamp_entity_check_entity_id)
);

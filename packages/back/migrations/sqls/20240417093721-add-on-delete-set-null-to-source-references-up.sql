ALTER TABLE label
  DROP CONSTRAINT label_source_id_fkey
;

ALTER TABLE label
  ADD CONSTRAINT label_source_id_fkey FOREIGN KEY (label_source) REFERENCES source (source_id) ON DELETE SET NULL
;
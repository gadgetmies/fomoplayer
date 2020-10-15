CREATE TYPE key_mode AS ENUM ('major', 'minor');

CREATE TYPE key_type as
(
    chord_number INT,
    mode         key_mode
);

COMMENT ON TYPE key_type IS 'Chord numbering is done according to the open key notation';

CREATE TABLE key
(
    key_id  SERIAL   NOT NULL PRIMARY KEY,
    key_key key_type NOT NULL
);

CREATE TABLE key_system
(
    key_system_id   SERIAL NOT NULL PRIMARY KEY,
    key_system_code TEXT   NOT NULL,
    key_system_name TEXT   NOT NULL
);

CREATE TABLE key_name
(
    key_name_id   SERIAL NOT NULL PRIMARY KEY,
    key_id        INT REFERENCES key (key_id),
    key_system_id INT REFERENCES key_system (key_system_id),
    key_name      TEXT   NOT NULL
);

CREATE TABLE track__key
(
    track_id INT REFERENCES track (track_id),
    key_id   INT REFERENCES key (key_id),
    UNIQUE (track_id, key_id)
);

INSERT INTO key (key_id, key_key)
VALUES (1, row (1, 'major')::key_type),
       (2, row (2, 'major')::key_type),
       (3, row (3, 'major')::key_type),
       (4, row (4, 'major')::key_type),
       (5, row (5, 'major')::key_type),
       (6, row (6, 'major')::key_type),
       (7, row (7, 'major')::key_type),
       (8, row (8, 'major')::key_type),
       (9, row (9, 'major')::key_type),
       (10, row (10, 'major')::key_type),
       (11, row (11, 'major')::key_type),
       (12, row (12, 'major')::key_type),
       (13, row (1, 'minor')::key_type),
       (14, row (2, 'minor')::key_type),
       (15, row (3, 'minor')::key_type),
       (16, row (4, 'minor')::key_type),
       (17, row (5, 'minor')::key_type),
       (18, row (6, 'minor')::key_type),
       (19, row (7, 'minor')::key_type),
       (20, row (8, 'minor')::key_type),
       (21, row (9, 'minor')::key_type),
       (22, row (10, 'minor')::key_type),
       (23, row (11, 'minor')::key_type),
       (24, row (12, 'minor')::key_type);

INSERT INTO key_system (key_system_id, key_system_code, key_system_name)
VALUES (1, 'open-key', 'Open key notation'),
       (2, 'camelot', 'Camelot'),
       (3, 'diatonic', 'Diatonic keys');

INSERT INTO key_name (key_id, key_system_id, key_name)
VALUES (1, 1, '1m'),
       (2, 1, '2m'),
       (3, 1, '3m'),
       (4, 1, '4m'),
       (5, 1, '5m'),
       (6, 1, '6m'),
       (7, 1, '7m'),
       (8, 1, '8m'),
       (9, 1, '9m'),
       (10, 1, '10m'),
       (11, 1, '11m'),
       (12, 1, '12m'),
       (13, 1, '1d'),
       (14, 1, '2d'),
       (15, 1, '3d'),
       (16, 1, '4d'),
       (17, 1, '5d'),
       (18, 1, '6d'),
       (19, 1, '7d'),
       (20, 1, '8d'),
       (21, 1, '9d'),
       (22, 1, '10d'),
       (23, 1, '11d'),
       (24, 1, '12d');

INSERT INTO key_name (key_id, key_system_id, key_name)
VALUES (1, 2, '8A'),
       (2, 2, '9A'),
       (3, 2, '10A'),
       (4, 2, '11A'),
       (5, 2, '12A'),
       (6, 2, '1A'),
       (7, 2, '2A'),
       (8, 2, '3A'),
       (9, 2, '4A'),
       (10, 2, '5A'),
       (11, 2, '6A'),
       (12, 2, '7A'),
       (13, 2, '8B'),
       (14, 2, '9B'),
       (15, 2, '10B'),
       (16, 2, '11B'),
       (17, 2, '12B'),
       (18, 2, '1B'),
       (19, 2, '2B'),
       (20, 2, '3B'),
       (21, 2, '4B'),
       (22, 2, '5B'),
       (23, 2, '6B'),
       (24, 2, '7B');

INSERT INTO key_name (key_id, key_system_id, key_name)
VALUES (13, 3, 'C maj'),
       (14, 3, 'G maj'),
       (15, 3, 'D maj'),
       (16, 3, 'A maj'),
       (17, 3, 'E maj'),
       (18, 3, 'B maj'),
       (19, 3, 'F♯ maj'),
       (19, 3, 'G♭ maj'),
       (20, 3, 'C♯ maj'),
       (20, 3, 'D♭ maj'),
       (21, 3, 'G♯ maj'),
       (21, 3, 'A♭ maj'),
       (22, 3, 'D♯ maj'),
       (22, 3, 'E♭ maj'),
       (23, 3, 'A♯ maj'),
       (23, 3, 'B♭ maj'),
       (24, 3, 'F maj'),
       (1, 3, 'A min'),
       (2, 3, 'E min'),
       (3, 3, 'B min'),
       (4, 3, 'F♯ min'),
       (4, 3, 'G♭ min'),
       (5, 3, 'C♯ min'),
       (5, 3, 'D♭ min'),
       (6, 3, 'G♯ min'),
       (6, 3, 'A♭ min'),
       (7, 3, 'D♯ min'),
       (7, 3, 'E♭ min'),
       (8, 3, 'A♯ min'),
       (8, 3, 'B♭ min'),
       (9, 3, 'F min'),
       (10, 3, 'C min'),
       (11, 3, 'G min'),
       (12, 3, 'D min');

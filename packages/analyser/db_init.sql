CREATE EXTENSION IF NOT EXISTS vector;
create type embedding_type as enum ('artist', 'multi');
create table track_embedding
(
    track_id               SERIAL PRIMARY KEY not null,
    track_embedding_vector vector(1280) not null,
    track_embedding_type   embedding_type not null,
    unique (track_id, track_embedding_type)
);
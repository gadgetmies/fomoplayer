DROP materialized view track_date_published_score;
create materialized view track_date_published_score as
SELECT track.track_id,
       date_part('days'::text,
                 now() - min(store__track.store__track_published)::timestamp with time zone)::numeric AS score
FROM track
         JOIN store__track USING (track_id)
GROUP BY track.track_id;
REFRESH MATERIALIZED VIEW track_date_published_score;

DROP materialized view track_date_added_score;
create materialized view track_date_added_score as
SELECT track.track_id,
       60::numeric -
       LEAST(60::double precision, date_part('days'::text, now() - LEAST(now(), track.track_added)))::numeric AS score
FROM track;
REFRESH materialized view track_date_added_score;

DROP materialized view track_date_released_score;
create materialized view track_date_released_score as
SELECT track.track_id,
       60::numeric - LEAST(60::double precision, date_part('days'::text, now() - LEAST(now(),
                                                                                       min(store__track.store__track_released)::timestamp with time zone)))::numeric AS score
FROM track
         JOIN store__track USING (track_id)
GROUP BY track.track_id;
REFRESH MATERIALIZED VIEW track_date_released_score;
